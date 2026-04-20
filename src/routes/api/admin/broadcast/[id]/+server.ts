import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBroadcastDetails } from '$lib/services/admin-broadcast';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	const broadcastId = String(params.id || '').trim();
	if (!isUuid(broadcastId)) {
		return json({ success: false, error: 'Invalid broadcast id.' }, { status: 400 });
	}

	const parsedLimit = Number(url.searchParams.get('limit') || 200);
	const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;
	const details = await getBroadcastDetails(broadcastId, limit);

	if (!details) {
		return json({ success: false, error: 'Broadcast not found.' }, { status: 404 });
	}

	return json({
		success: true,
		data: details
	});
};
