import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCacheHeaders } from '$lib/helpers/cache';
import { getOrderStatsSnapshot, getBoostingOrderStatsSnapshot } from '$lib/services/admin-metrics';
import { canViewRevenue, redactOrderStatsRevenue } from '$lib/services/admin-revenue-visibility';
import { hasAdminPermission } from '$lib/auth/admin-roles';

// GET /api/orders/stats - Get order statistics for admin dashboard
export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:access')) {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const [stats, boostingStats] = await Promise.all([
			getOrderStatsSnapshot(),
			getBoostingOrderStatsSnapshot()
		]);
		const revenueVisible = canViewRevenue(locals);
		const responseStats = revenueVisible ? stats : redactOrderStatsRevenue(stats);
		const responseBoostingStats = revenueVisible
			? boostingStats
			: redactOrderStatsRevenue(boostingStats);
		const headers = getCacheHeaders('admin-live');
		const cleanHeaders = Object.fromEntries(
			Object.entries(headers).filter(([, v]) => v !== undefined)
		);

		return json(
			{ data: responseStats, boostingData: responseBoostingStats, error: null },
			{
				headers: cleanHeaders
			}
		);
	} catch (error) {
		console.error('Failed to get order statistics:', error);
		return json({ data: null, error: 'Failed to get order statistics' }, { status: 500 });
	}
};
