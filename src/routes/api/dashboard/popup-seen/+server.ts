import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markSitePopupSeen, type SitePopupType } from '$lib/services/site-popups';

const SITE_POPUP_TYPES = [
	'first_purchase',
	'catalog_updates',
	'boosting_launch',
	'bank_details_outcome'
] as const satisfies readonly SitePopupType[];

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const type = String(payload?.type || '').trim();

	if (!(SITE_POPUP_TYPES as readonly string[]).includes(type)) {
		return json({ success: false, error: 'Invalid popup type' }, { status: 400 });
	}

	await markSitePopupSeen(locals.user.id, type as SitePopupType);

	return json({ success: true });
};
