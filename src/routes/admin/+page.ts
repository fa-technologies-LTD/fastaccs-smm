import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Load order stats
		const orderStatsResponse = await fetch('/api/orders/stats');
		let orderStats = {
			total_orders: 0,
			pending_orders: 0,
			processing_orders: 0,
			completed_orders: 0,
			failed_orders: 0,
			todays_orders: 0,
			total_revenue: 0,
			todays_revenue: 0
		};

		if (orderStatsResponse.ok) {
			const orderResult = await orderStatsResponse.json();
			orderStats = orderResult.data || orderStats;
		}

		// Load inventory stats
		const inventoryStatsResponse = await fetch('/api/inventory?type=stats');
		let inventoryStats = {
			total_tiers: 0,
			total_available: 0,
			total_reserved: 0,
			out_of_stock: 0,
			low_stock: 0,
			platforms: 0
		};

		if (inventoryStatsResponse.ok) {
			const inventoryResult = await inventoryStatsResponse.json();
			inventoryStats = inventoryResult.data || inventoryStats;
		}

		return {
			orderStats,
			inventoryStats,
			error: null
		};
	} catch (err) {
		console.error('Error loading admin dashboard:', err);
		return {
			orderStats: {
				total_orders: 0,
				pending_orders: 0,
				processing_orders: 0,
				completed_orders: 0,
				failed_orders: 0,
				todays_orders: 0,
				total_revenue: 0,
				todays_revenue: 0
			},
			inventoryStats: {
				total_tiers: 0,
				total_available: 0,
				total_reserved: 0,
				out_of_stock: 0,
				low_stock: 0,
				platforms: 0
			},
			error: 'Failed to load dashboard data'
		};
	}
};
