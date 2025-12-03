import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { initializePayment } from '$lib/services/payment';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { amount } = await request.json();

		if (!amount || amount <= 0) {
			return json({ success: false, error: 'Invalid amount' }, { status: 400 });
		}

		// Initialize Paystack payment for wallet funding
		const reference = `wallet_${user.id}_${Date.now()}`;

		const paymentResult = await initializePayment({
			email: user.email || '',
			amount: amount,
			reference,
			metadata: {
				type: 'wallet_funding',
				userId: user.id,
				amount
			}
		});

		if (!paymentResult.success) {
			return json({ success: false, error: paymentResult.error }, { status: 400 });
		}

		return json({
			success: true,
			authorizationUrl: paymentResult.authorizationUrl,
			reference
		});
	} catch (error) {
		console.error('Error initializing wallet funding:', error);
		return json({ success: false, error: 'Failed to initialize payment' }, { status: 500 });
	}
};
