import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { toBrowserUser } from '$lib/auth/browser-session';
import { getDashboardInitialData } from '$lib/server/dashboard-load';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/dashboard');
	}

	try {
		const data = await getDashboardInitialData(locals.user.id);

		return {
			user: toBrowserUser(locals.user),
			...data,
			messages: [], // TODO: Implement messages/notifications system
			error: null
		};
	} catch (error) {
		console.error('Dashboard load error:', error);
		return {
			user: toBrowserUser(locals.user),
			orders: [],
			ordersNextCursor: null,
			metrics: { completedOrders: 0, totalSpent: 0, accountsOwned: 0 },
			affiliateData: null,
			affiliateLoaded: false,
			storeCredit: null,
			purchases: [],
			purchasesNextCursor: null,
			purchasesLoaded: false,
			support: { whatsappNumber: '' },
			messages: [],
			error: error instanceof Error ? error.message : 'Failed to load dashboard data'
		};
	}
};
