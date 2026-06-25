import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeSubscription } from '$lib/services/push-notifications';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
	if (typeof payload.endpoint !== 'string') {
		return json({ success: false, error: 'Invalid payload.' }, { status: 400 });
	}

	await removeSubscription(payload.endpoint);

	return json({ success: true });
};
