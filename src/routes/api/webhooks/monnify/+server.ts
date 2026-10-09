import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature } from '$lib/services/payment';
import {
	normalizeWebhookPayload,
	receivePaymentWebhook,
	drainPaymentWebhookInbox
} from '$lib/services/payment-webhook-inbox';

export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();
	const signature = request.headers.get('monnify-signature');
	if (!signature) return json({ success: false, error: 'No signature provided' }, { status: 400 });
	if (!verifyWebhookSignature(signature, rawBody))
		return json({ success: false, error: 'Invalid signature' }, { status: 401 });
	if (rawBody.length > 65536)
		return json({ success: false, error: 'Webhook too large' }, { status: 413 });
	let payload;
	try {
		payload = normalizeWebhookPayload(JSON.parse(rawBody));
	} catch {
		return json({ success: false, error: 'Invalid webhook' }, { status: 400 });
	}
	try {
		const eventKey = await receivePaymentWebhook(payload);
		// Attempt immediate settlement; the cron still owns durable recovery if this request dies.
		await drainPaymentWebhookInbox(1, eventKey).catch(() => {});
		return json({ success: true });
	} catch {
		// Never acknowledge before durable storage commits. Monnify must redeliver.
		return json({ success: false, retryable: true }, { status: 503 });
	}
};
