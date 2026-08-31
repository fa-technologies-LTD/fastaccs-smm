import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';

const ALLOWED_EVENTS = new Set([
	'affiliate_dashboard_viewed',
	'affiliate_code_copied',
	'affiliate_link_copied',
	'affiliate_whatsapp_share_started',
	'affiliate_message_copied'
]);

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user?.id) {
		return json({ success: false, error: 'Authentication required.' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const type = String(body?.type || '')
		.trim()
		.toLowerCase();
	const eventId = String(body?.eventId || '').trim();
	if (!ALLOWED_EVENTS.has(type) || !/^[a-zA-Z0-9_-]{8,100}$/.test(eventId)) {
		return json({ success: false, error: 'Invalid affiliate event.' }, { status: 400 });
	}

	const program = await prisma.affiliateProgram.findFirst({
		where: {
			userId: locals.user.id,
			status: 'active',
			user: { isActive: true, isAffiliateEnabled: true }
		},
		select: { id: true }
	});
	if (!program) {
		return json({ success: false, error: 'Active affiliate access required.' }, { status: 403 });
	}

	const recorded = await recordAffiliateEvent({
		type,
		dedupeKey: `affiliate:interaction:${locals.user.id}:${type}:${eventId}`,
		affiliateProgramId: program.id,
		affiliateUserId: locals.user.id,
		source: 'affiliate_dashboard'
	});

	return json({ success: true, recorded });
};
