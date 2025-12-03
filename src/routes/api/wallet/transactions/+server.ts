import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWalletTransactions } from '$lib/services/wallet';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const type = url.searchParams.get('type') as 'deposit' | 'debit' | 'refund' | undefined;

	const result = await getWalletTransactions(user.id, { limit, offset, type });

	if (!result.success) {
		return json({ success: false, error: result.error }, { status: 500 });
	}

	return json({
		success: true,
		transactions: result.transactions,
		total: result.total
	});
};
