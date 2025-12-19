import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Check if user is authenticated
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/dashboard');
	}

	try {
		// Fetch all dashboard data in parallel
		const [ordersRes, affiliateRes, walletBalanceRes, walletTransactionsRes, purchasesRes] =
			await Promise.all([
				fetch(`/api/orders?userId=${locals.user.id}&limit=50`),
				fetch('/api/affiliate/stats'),
				fetch('/api/wallet/balance'),
				fetch('/api/wallet/transactions?limit=20'),
				fetch('/api/purchases')
			]);

		// Parse orders
		let orders = [];
		if (ordersRes.ok) {
			const result = await ordersRes.json();
			orders = result.data || [];
		}

		// Parse affiliate data
		let affiliateData = null;
		if (affiliateRes.ok) {
			const result = await affiliateRes.json();
			affiliateData = result.success ? result.data : null;
		}

		// Parse wallet balance
		let walletBalance = 0;
		if (walletBalanceRes.ok) {
			const result = await walletBalanceRes.json();
			walletBalance = result.success ? result.balance || 0 : 0;
		}

		// Parse wallet transactions
		let walletTransactions = [];
		if (walletTransactionsRes.ok) {
			const result = await walletTransactionsRes.json();
			walletTransactions = result.success ? result.transactions || [] : [];
		}

		// Parse purchases
		let purchases = [];
		if (purchasesRes.ok) {
			const result = await purchasesRes.json();
			purchases = result.purchases || [];
		}

		return {
			user: locals.user,
			orders,
			affiliateData,
			walletBalance,
			walletTransactions,
			purchases,
			messages: [], // TODO: Implement messages/notifications system
			error: null
		};
	} catch (error) {
		console.error('Dashboard load error:', error);
		return {
			user: locals.user,
			orders: [],
			affiliateData: null,
			walletBalance: 0,
			walletTransactions: [],
			purchases: [],
			messages: [],
			error: 'Failed to load dashboard data'
		};
	}
};
