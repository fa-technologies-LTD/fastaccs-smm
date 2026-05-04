import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCacheHeaders } from '$lib/helpers/cache';
import { getOrderStatsSnapshot } from '$lib/services/admin-metrics';
import { canViewRevenue, redactOrderStatsRevenue } from '$lib/services/admin-revenue-visibility';

// GET /api/orders/stats - Get order statistics for admin dashboard
export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const stats = await getOrderStatsSnapshot();
		const responseStats = canViewRevenue(locals) ? stats : redactOrderStatsRevenue(stats);
		const headers = getCacheHeaders('admin-live');
		const cleanHeaders = Object.fromEntries(
			Object.entries(headers).filter(([, v]) => v !== undefined)
		);

		return json(
			{ data: responseStats, error: null },
			{
				headers: cleanHeaders
			}
		);
	} catch (error) {
		console.error('Failed to get order statistics:', error);
		return json({ data: null, error: 'Failed to get order statistics' }, { status: 500 });
	}
};
