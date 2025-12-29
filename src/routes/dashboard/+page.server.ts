import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Check if user is authenticated
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/dashboard');
	}

	try {
		// Fetch all dashboard data from single consolidated endpoint
		const response = await fetch('/api/dashboard');

		if (!response.ok) {
			throw new Error('Failed to fetch dashboard data');
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(result.error || 'Failed to load dashboard data');
		}

		return {
			user: locals.user,
			orders: result.data.orders || [],
			affiliateData: result.data.affiliateData || null,
			walletBalance: result.data.walletBalance || 0,
			walletTransactions: result.data.walletTransactions || [],
			purchases: result.data.purchases || [],
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
			error: error instanceof Error ? error.message : 'Failed to load dashboard data'
		};
	}
};
