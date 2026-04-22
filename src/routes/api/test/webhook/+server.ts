import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { verifyWebhookSignature } from '$lib/services/payment';

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) {
		return json(
			{
				success: false,
				error: 'Not found'
			},
			{ status: 404 }
		);
	}

	try {
		const signature = request.headers.get('monnify-signature');
		const rawBody = await request.text();

		let body: unknown;
		try {
			body = JSON.parse(rawBody);
		} catch {
			return json(
				{
					success: false,
					error: 'Invalid JSON payload'
				},
				{ status: 400 }
			);
		}

		if (!signature) {
			return json({
				success: true,
				message: 'Webhook endpoint reachable (no signature provided)',
				signatureProvided: false,
				body: body
			});
		}

		const isValid = verifyWebhookSignature(signature, rawBody);

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
