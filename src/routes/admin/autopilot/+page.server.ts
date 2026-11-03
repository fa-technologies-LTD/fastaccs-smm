import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isOwnerAdmin } from '$lib/auth/owner';
import { prisma } from '$lib/prisma';
import {
	botConfigured,
	botSetWebhook,
	botUsername,
	botWebhookInfo,
	type WebhookHealth
} from '$lib/server/autopilot/bot';
import { watDay } from '$lib/server/autopilot/engine';
import { botWebhookSecret } from '$lib/server/autopilot/job';
import { SITE_URL } from '$lib/server/autopilot/money';
import { MAX_KEYWORDS } from '$lib/server/autopilot/settings';
import {
	getAutopilotSettings,
	getChannel,
	getGroupRunState,
	getRunState,
	listGroups,
	saveAutopilotSettings,
	saveChannel
} from '$lib/server/autopilot/state';
import { userbotConfigured } from '$lib/server/autopilot/userbot';

const WEBHOOK_URL = `${SITE_URL}/api/telegram/bot`;

async function bindLinkFor(code: string | null): Promise<string | null> {
	if (!code || !botConfigured()) return null;
	const username = await botUsername().catch(() => null);
	return username ? `https://t.me/${username}?start=${code}` : null;
}

/** Can Telegram reach the site? (Telegram's own delivery report.) */
async function webhookStatus(): Promise<
	(WebhookHealth & { pointsHere: boolean; recentError: boolean }) | null
> {
	if (!botConfigured()) return null;
	const info = await botWebhookInfo().catch(() => null);
	if (!info) return null;
	const recent =
		Boolean(info.lastErrorAt) && Date.now() - new Date(info.lastErrorAt!).getTime() < 3_600_000;
	return { ...info, pointsHere: info.url === WEBHOOK_URL, recentError: recent };
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:revenue:view')) throw error(403, 'Forbidden');
	const isOwner = isOwnerAdmin(locals.user, locals.adminContext);
	const [settings, state, actions, groups, groupState] = await Promise.all([
		getAutopilotSettings(),
		getRunState(),
		prisma.marketingAction.findMany({
			where: { channelKey: 'telegram' },
			orderBy: { createdAt: 'desc' },
			take: 30,
			select: { createdAt: true, action: true, placementKey: true }
		}),
		listGroups(),
		getGroupRunState()
	]);
	return {
		isOwner,
		settings: { ...settings, bindCode: null },
		// Until the owner's chat is connected, keep showing their link (owner only).
		bindLink: isOwner && !settings.ownerChatId ? await bindLinkFor(settings.bindCode) : null,
		webhook: isOwner ? await webhookStatus() : null,
		groups: {
			today:
				groupState.day === watDay(new Date())
					? {
							replies: groupState.repliesToday,
							posts: groupState.postsToday,
							joins: groupState.joinsToday
						}
					: { replies: 0, posts: 0, joins: 0 },
			lastRunAt: groupState.lastRunAt,
			queued: groupState.candidates.length,
			rows: groups
				.sort(
					(a, b) =>
						['joined', 'blocked', 'found', 'skipped'].indexOf(a.status) -
							['joined', 'blocked', 'found', 'skipped'].indexOf(b.status) || b.replies - a.replies
				)
				.slice(0, 150)
				.map((g) => ({
					username: g.username,
					title: g.title,
					members: g.members,
					status: g.status,
					reason: g.reason,
					adsAllowed: g.adsAllowed,
					replies: g.replies,
					missed: g.missed,
					promoPosts: g.promoPosts,
					promoStopped: g.promoStopped,
					lastNote: g.log.at(-1) ?? ''
				}))
		},
		ready: {
			bot: botConfigured(),
			telegramAccount: userbotConfigured(),
			ownerConnected: Boolean(settings.ownerChatId)
		},
		state: {
			lastError: state.lastError,
			pausedUntil: state.pausedUntil
		},
		actions: actions.map((a) => ({
			at: a.createdAt.toISOString(),
			action: a.action,
			channel: a.placementKey
		}))
	};
};

type Ctx = Parameters<Actions[string]>[0];
const ownerOnly = (ctx: Ctx) =>
	isOwnerAdmin(ctx.locals.user, ctx.locals.adminContext) && ctx.locals.user
		? null
		: fail(403, { error: 'Only the owner can change the autopilot.' });

const num = (form: FormData, key: string, fallback: number) => {
	const n = Number(String(form.get(key) ?? '').replace(/[₦,\s]/g, ''));
	return Number.isFinite(n) && String(form.get(key) ?? '').trim() !== '' ? Math.floor(n) : fallback;
};
const lines = (value: FormDataEntryValue | null) =>
	String(value ?? '')
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);

export const actions: Actions = {
	saveRules: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const s = await getAutopilotSettings();
		await saveAutopilotSettings({
			...s,
			dailyNewContacts: 0,
			partnerEnabled: false,
			groupsEnabled: form.get('groupsEnabled') === 'on',
			groupRepliesPerDay: Math.min(
				30,
				Math.max(0, num(form, 'groupRepliesPerDay', s.groupRepliesPerDay))
			),
			groupJoinsPerDay: Math.min(8, Math.max(0, num(form, 'groupJoinsPerDay', s.groupJoinsPerDay))),
			groupPostsPerDay: Math.min(
				10,
				Math.max(0, num(form, 'groupPostsPerDay', s.groupPostsPerDay))
			),
			groupKeywords: lines(form.get('groupKeywords')).slice(0, MAX_KEYWORDS)
		});
		return { message: 'Rules saved.' };
	},

	toggle: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const s = await getAutopilotSettings();
		const field = String(form.get('field'));
		if (field === 'enabled') {
			const turnOn = !s.enabled;
			await saveAutopilotSettings({ ...s, enabled: turnOn });
			return { message: turnOn ? 'Autopilot is on.' : 'Autopilot is off.' };
		}
		if (field === 'testMode') {
			return fail(400, { error: 'Channel outreach test mode has been retired.' });
		}
		return fail(400, { error: 'Unknown switch.' });
	},

	connectBot: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const secret = botWebhookSecret();
		if (!botConfigured() || !secret)
			return fail(400, { error: 'Add TELEGRAM_BOT_TOKEN in Vercel first.' });
		// Telegram can only reach the live site, so the webhook always points there.
		await botSetWebhook(WEBHOOK_URL, secret);
		const s = await getAutopilotSettings();
		// Pressing again keeps the same link until it's used (an older link must keep working).
		const bindCode =
			s.bindCode && !s.ownerChatId ? s.bindCode : randomBytes(9).toString('base64url');
		if (bindCode !== s.bindCode) await saveAutopilotSettings({ ...s, bindCode });
		return {
			message: s.ownerChatId
				? 'Bot reconnected. To move approvals to a different chat, open the link below there and press Start.'
				: 'Bot connected to the site. Open the link below on your phone and press Start.',
			bindLink: await bindLinkFor(bindCode)
		};
	},

	tryChannels: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		return fail(410, { error: 'Paid channel outreach has been retired.' });
	},

	addChannel: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		return fail(410, { error: 'Paid channel outreach has been retired.' });
	},

	skip: async (ctx) => {
		const denied = ownerOnly(ctx);
		if (denied) return denied;
		const form = await ctx.request.formData();
		const rec = await getChannel(String(form.get('username') ?? ''));
		if (!rec) return fail(404, { error: 'Not found.' });
		if (['paid', 'posted', 'done'].includes(rec.status))
			return fail(400, { error: 'Already paid.' });
		const saved = await saveChannel(
			{ ...rec, status: 'skipped', waitingOwner: false },
			'owner skipped (admin page)'
		);
		if (!saved) return fail(409, { error: 'The autopilot was updating this channel. Try again.' });
		return { message: `@${rec.username} skipped.` };
	}
};
