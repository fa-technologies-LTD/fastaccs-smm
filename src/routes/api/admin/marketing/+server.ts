import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { slugifyUtm } from '$lib/helpers/tracked-link';
import { upsertChannel } from '$lib/services/marketing/channels';
import { recordManualBooking } from '$lib/services/marketing/spend-ledger';
import { discardHeldPostback, dispatchAdPostbacks } from '$lib/services/marketing/postbacks';
import { recordMarketingAction } from '$lib/services/marketing/placement-report';
import {
	PROPELLER_CHANNEL_KEY,
	excludePropellerZones,
	getPropellerToken
} from '$lib/services/marketing/spend-sources/propellerads';

/**
 * Marketing admin actions. Every change is written to marketing_actions for audit.
 *   save_channel       create/update a channel (postback URL, targets, status)
 *   book_spend         record a direct buy's cost, spread across its days
 *   postback_decision  send or discard a held conversion postback
 *   block_zone         add a PropellerAds zone to a campaign's blocklist
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status = 400) {
	return json({ success: false, error }, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
		return fail('Forbidden', 403);
	}
	const actor = locals.user?.email ?? locals.user?.id ?? 'admin';

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return fail('Invalid request body');
	}

	try {
		switch (body.action) {
			case 'save_channel': {
				const channel = await upsertChannel(body);
				await recordMarketingAction({
					channelKey: channel.key,
					action: 'save_channel',
					detail: { ...channel, postbackTemplate: channel.postbackTemplate ? 'set' : null },
					actor
				});
				return json({ success: true, data: channel });
			}

			case 'book_spend': {
				const channelKey = slugifyUtm(String(body.channelKey ?? ''));
				const campaignKey = slugifyUtm(String(body.campaignKey ?? ''), 80);
				const placementKey = slugifyUtm(String(body.placementKey ?? ''), 120);
				const totalNgn = Number(body.totalNgn);
				if (!channelKey) return fail('Source is required');
				if (!(totalNgn > 0) || totalNgn > 10_000_000) return fail('Enter the amount paid in naira');
				// Direct buys may not have a channel row yet; create a minimal one for the ledger.
				await prisma.$executeRaw`
					INSERT INTO marketing_channels (key, name, kind, status, updated_at)
					VALUES (${channelKey}, ${channelKey}, 'direct', 'testing', now())
					ON CONFLICT (key) DO NOTHING`;
				const days = await recordManualBooking({
					channelKey,
					campaignKey,
					placementKey,
					totalNgn,
					startDay: String(body.startDay ?? ''),
					endDay: String(body.endDay ?? body.startDay ?? '')
				});
				await recordMarketingAction({
					channelKey,
					campaignKey,
					placementKey,
					action: 'book_spend',
					detail: { totalNgn, startDay: body.startDay, endDay: body.endDay, days },
					actor
				});
				return json({ success: true, data: { days } });
			}

			case 'postback_decision': {
				const orderId = String(body.orderId ?? '');
				if (!UUID.test(orderId)) return fail('Invalid order');
				if (body.decision === 'discard') {
					const discarded = await discardHeldPostback(orderId, actor);
					if (!discarded) return fail('That postback is no longer waiting for review', 409);
					await recordMarketingAction({
						channelKey: String(body.channelKey ?? ''),
						action: 'discard_postback',
						detail: { orderId },
						actor
					});
					return json({ success: true, data: { state: 'discarded' } });
				}
				if (body.decision === 'send') {
					const summary = await dispatchAdPostbacks({ orderIds: [orderId] });
					await recordMarketingAction({
						channelKey: String(body.channelKey ?? ''),
						action: 'send_held_postback',
						detail: { orderId, summary },
						actor
					});
					return json({ success: true, data: summary });
				}
				return fail('Choose send or discard');
			}

			case 'block_zone': {
				const token = getPropellerToken();
				if (!token) return fail('PropellerAds API token is not configured', 409);
				const campaignKey = String(body.campaignKey ?? '');
				const placementKey = String(body.placementKey ?? '');
				await excludePropellerZones({
					token,
					campaignId: campaignKey,
					zoneIds: [placementKey]
				});
				await recordMarketingAction({
					channelKey: PROPELLER_CHANNEL_KEY,
					campaignKey,
					placementKey,
					action: 'block_zone',
					reason: String(body.reason ?? '').slice(0, 300) || undefined,
					actor
				});
				return json({ success: true });
			}

			default:
				return fail('Unknown action');
		}
	} catch (error) {
		console.error('[admin.marketing] action failed', { action: body.action, error });
		return fail(error instanceof Error ? error.message : 'Marketing action failed', 400);
	}
};
