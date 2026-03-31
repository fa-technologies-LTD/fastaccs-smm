// ARCHIVED — wallet funding via payment gateway is disabled.
// The wallet system is kept for potential future use but is not accessible to users.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	return json(
		{ success: false, error: 'Wallet funding is currently unavailable.' },
		{ status: 410 }
	);
};

	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { amount } = await request.json();

		if (!amount || amount <= 0) {
			return json({ success: false, error: 'Invalid amount' }, { status: 400 });
		}

		// Initialize Korapay payment for wallet funding
		// Korapay has 50 char limit: wallet_XXXXXXXX_TIMESTAMP (max 30 chars)
		const shortUserId = user.id.substring(0, 8);
		const reference = `WLT_${shortUserId}_${Date.now()}`;

		const paymentResult = await initializePayment({
			email: user.email || '',
			amount: amount,
			reference,
			narration: 'Wallet Funding',
			redirectUrl: 'http://localhost:5173/dashboard',
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
