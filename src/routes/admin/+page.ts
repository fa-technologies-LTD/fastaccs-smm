import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Load order stats
		const orderStatsResponse = await fetch('/api/orders/stats');
		let orderStats = {
			total_orders: 0,
			paid_orders: 0,
			pending_orders: 0,
			processing_orders: 0,
			completed_orders: 0,
			cancelled_orders: 0,
			failed_orders: 0,
			todays_orders: 0,
			total_revenue: 0,
			todays_revenue: 0,
			units_sold: 0,
			total_users: 0
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
			total_sold: 0,
			lifetime_sold_stock: 0,
			out_of_stock: 0,
			low_stock: 0,
			platforms: 0,
			product_types: 0,
			accountsInOutOfStockTiers: 0,
			outOfStockTiersCount: 0
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
				paid_orders: 0,
				pending_orders: 0,
				processing_orders: 0,
				completed_orders: 0,
				cancelled_orders: 0,
				failed_orders: 0,
				todays_orders: 0,
				total_revenue: 0,
				todays_revenue: 0,
				units_sold: 0,
				total_users: 0
			},
			inventoryStats: {
				total_tiers: 0,
				total_available: 0,
				total_reserved: 0,
				total_sold: 0,
				lifetime_sold_stock: 0,
				out_of_stock: 0,
				low_stock: 0,
				platforms: 0,
				product_types: 0,
				accountsInOutOfStockTiers: 0,
				outOfStockTiersCount: 0
			},
			error: 'Failed to load dashboard data'
		};
	}
};
