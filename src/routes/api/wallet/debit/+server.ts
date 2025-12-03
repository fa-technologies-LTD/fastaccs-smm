import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { debitWallet } from '$lib/services/wallet';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { amount, orderId } = await request.json();

		if (!amount || amount <= 0) {
			return json({ success: false, error: 'Invalid amount' }, { status: 400 });
		}

		if (!orderId) {
			return json({ success: false, error: 'Order ID is required' }, { status: 400 });
		}

		const result = await debitWallet(user.id, amount, orderId, `Payment for order ${orderId}`);

		if (!result.success) {
			return json({ success: false, error: result.error }, { status: 400 });
		}

		return json({
			success: true,
			transaction: result.transaction
		});
	} catch (error) {
		console.error('Error debiting wallet:', error);
		return json({ success: false, error: 'Failed to debit wallet' }, { status: 500 });
	}
};
