import { getInventoryStats, getLowStockAlerts, getTierInventory } from '$lib/services/inventory';
import type { LoadEvent } from '@sveltejs/kit';

export const load = async ({ parent, url }: LoadEvent) => {
	await parent();

	const searchParams = url.searchParams;
	const platform = searchParams.get('platform') || 'all';
	const status = searchParams.get('status') || 'all';

	try {
		// Get inventory stats
		const { data: stats, error: statsError } = await getInventoryStats();
		if (statsError) throw statsError;

		// Get low stock alerts
		const { data: alerts, error: alertsError } = await getLowStockAlerts(10);
		if (alertsError) throw alertsError;

		// Get tier inventory
		const { data: inventory, error: inventoryError } = await getTierInventory();
		if (inventoryError) throw inventoryError;

		// Filter by platform if specified
		let filteredInventory = inventory || [];
		if (platform !== 'all') {
			filteredInventory = filteredInventory.filter(
				(item) => item.platform_name?.toLowerCase() === platform.toLowerCase()
			);
		}

		// Filter by status if specified
		if (status !== 'all') {
			switch (status) {
				case 'out_of_stock':
					filteredInventory = filteredInventory.filter((item) => item.visible_available === 0);
					break;
				case 'low_stock':
					filteredInventory = filteredInventory.filter(
						(item) => item.visible_available > 0 && item.visible_available < 10
					);
					break;
				case 'in_stock':
					filteredInventory = filteredInventory.filter((item) => item.visible_available >= 10);
					break;
			}
		}

		return {
			stats: stats || {
				total_tiers: 0,
				total_available: 0,
				total_reserved: 0,
				out_of_stock: 0,
				low_stock: 0,
				platforms: 0
			},
			alerts: alerts || [],
			inventory: filteredInventory,
			filters: { platform, status }
		};
	} catch (error) {
		console.error('Error loading inventory:', error);
		return {
			stats: {
				total_tiers: 0,
				total_available: 0,
				total_reserved: 0,
				out_of_stock: 0,
				low_stock: 0,
				platforms: 0
			},
			alerts: [],
			inventory: [],
			filters: { platform, status },
			error: 'Failed to load inventory data'
		};
	}
};
