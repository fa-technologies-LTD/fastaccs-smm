import type { PageLoad } from './$types';
import { getOrderStats } from '$lib/services/orders';
import { getInventoryStats } from '$lib/services/inventory';

export const load: PageLoad = async () => {
	// Default fallback data
	const defaultOrderStats = {
		total_orders: 0,
		pending_orders: 0,
		processing_orders: 0,
		completed_orders: 0,
		failed_orders: 0,
		todays_orders: 0,
		total_revenue: 0,
		todays_revenue: 0
	};

	const defaultInventoryStats = {
		total_tiers: 0,
		total_available: 0,
		total_reserved: 0,
		out_of_stock: 0,
		low_stock: 0,
		platforms: 0
	};

	try {
		// Load data from services with individual error handling
		const orderStatsPromise = getOrderStats().catch((err) => {
			console.warn('Order stats failed:', err);
			return { data: null, error: err };
		});

		const inventoryStatsPromise = getInventoryStats().catch((err) => {
			console.warn('Inventory stats failed:', err);
			return { data: null, error: err };
		});

		const [orderStatsResult, inventoryStatsResult] = await Promise.all([
			orderStatsPromise,
			inventoryStatsPromise
		]);

		// Collect any errors for display
		const errors = [];
		if (orderStatsResult.error) {
			errors.push('Order statistics unavailable');
		}
		if (inventoryStatsResult.error) {
			errors.push('Inventory statistics unavailable');
		}

		return {
			orderStats: orderStatsResult.data || defaultOrderStats,
			inventoryStats: inventoryStatsResult.data || defaultInventoryStats,
			error: errors.length > 0 ? errors.join(', ') : null
		};
	} catch (err) {
		console.error('Critical error loading admin dashboard:', err);
		// Still return defaults instead of throwing
		return {
			orderStats: defaultOrderStats,
			inventoryStats: defaultInventoryStats,
			error: 'Dashboard services are currently unavailable'
		};
	}
};
