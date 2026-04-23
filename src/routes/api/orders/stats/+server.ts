import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { serverCache, getCacheHeaders, CACHE_TTL } from '$lib/helpers/cache';
import { getOrderStatsSnapshot } from '$lib/services/admin-metrics';
import { canViewRevenue, redactOrderStatsRevenue } from '$lib/services/admin-revenue-visibility';

// GET /api/orders/stats - Get order statistics for admin dashboard
export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const cacheKey = 'admin:order-stats';

		// Try cache first
		const cached = serverCache.get(cacheKey, CACHE_TTL.ADMIN_STATS);
		if (cached) {
			const responseStats = canViewRevenue(locals) ? cached : redactOrderStatsRevenue(cached);
			const headers = getCacheHeaders('dynamic');
			const cleanHeaders = Object.fromEntries(
				Object.entries(headers).filter(([, v]) => v !== undefined)
			);
			return json(
				{ data: responseStats, error: null },
				{
					headers: cleanHeaders
				}
			);
		}

		const stats = await getOrderStatsSnapshot();
		const responseStats = canViewRevenue(locals) ? stats : redactOrderStatsRevenue(stats);

		// Cache the result
		serverCache.set(cacheKey, stats);

		const headers = getCacheHeaders('dynamic');
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
