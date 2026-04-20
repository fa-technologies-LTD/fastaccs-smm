import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBroadcastHistory } from '$lib/services/admin-broadcast';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	const parsedLimit = Number(url.searchParams.get('limit') || 20);
	const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;
	const history = await getBroadcastHistory(limit);

	return json({
		success: true,
		data: history
	});
};
