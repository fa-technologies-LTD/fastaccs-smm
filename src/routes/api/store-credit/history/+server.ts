import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStoreCreditHistory, getStoreCreditBuckets } from '$lib/services/store-credit';

// The signed-in user's own store-credit ledger + current spendable balance (for the dashboard card).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const [entries, buckets] = await Promise.all([
		getStoreCreditHistory(locals.user.id, 50),
		getStoreCreditBuckets(locals.user.id)
	]);
	return json({
		success: true,
		balance: Math.round(buckets.totalAvailable),
		earned: Math.round(buckets.earnedAvailable),
		refund: Math.round(buckets.refundAvailable),
		entries
	});
};
