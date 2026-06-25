import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveSubscription } from '$lib/services/push-notifications';

interface SubscribePayload {
	subscription?: {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	};
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = (await request.json().catch(() => ({}))) as SubscribePayload;
	const endpoint = payload.subscription?.endpoint;
	const p256dh = payload.subscription?.keys?.p256dh;
	const auth = payload.subscription?.keys?.auth;

	if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
		return json({ success: false, error: 'Invalid subscription payload.' }, { status: 400 });
	}

	await saveSubscription(
		locals.user.id,
		{ endpoint, keys: { p256dh, auth } },
		request.headers.get('user-agent')
	);

	return json({ success: true });
};
