import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Check if user is authenticated
	if (!locals.user) {
		throw redirect(302, '/auth/login?returnUrl=/dashboard');
	}

	try {
		// Fetch user's orders using the API
		const response = await fetch(`/api/orders?userId=${locals.user.id}&limit=50`);
		let orders = [];

		if (response.ok) {
			const result = await response.json();
			orders = result.data || [];
		}

		return {
			user: locals.user,
			orders,
			error: null
		};
	} catch (error) {
		console.error('Dashboard load error:', error);
		return {
			user: locals.user,
			orders: [],
			error: 'Failed to load dashboard data'
		};
	}
};
