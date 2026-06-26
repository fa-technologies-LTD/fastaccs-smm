import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPendingSitePopup } from '$lib/services/site-popups';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized', popup: null }, { status: 401 });
	}

	const popup = await getPendingSitePopup(locals.user.id);
	return json({ success: true, popup });
};
