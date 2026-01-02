import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature } from '$lib/services/payment';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const signature = request.headers.get('x-korapay-signature');
		const body = await request.json();

		if (!signature) {
			return json({
				success: true,
				message: 'Webhook endpoint reachable (no signature provided)',
				signatureProvided: false,
				body: body
			});
		}

		const isValid = verifyWebhookSignature(signature, body.data);

		return json({
			success: true,
			signatureProvided: true,
			signatureValid: isValid,
			receivedSignature: signature,
			body: body
		});
	} catch (error) {
		console.error('Test webhook error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
};
