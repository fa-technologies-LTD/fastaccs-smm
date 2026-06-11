import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markAffiliatePopupSeen, type AffiliatePopupType } from '$lib/services/affiliate';

const AFFILIATE_POPUP_TYPES = [
	'welcome',
	'progress_50',
	'progress_80',
	'progress_95',
	'unlocked'
] as const satisfies readonly AffiliatePopupType[];

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const popup = String(payload?.popup || '').trim();

	if (!(AFFILIATE_POPUP_TYPES as readonly string[]).includes(popup)) {
		return json({ success: false, error: 'Invalid popup type' }, { status: 400 });
	}

	await markAffiliatePopupSeen(locals.user.id, popup as AffiliatePopupType);

	return json({ success: true });
};
