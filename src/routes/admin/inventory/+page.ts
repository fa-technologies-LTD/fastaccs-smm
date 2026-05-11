export const load = async ({ fetch }) => {
	try {
		// Get inventory data from the API
		const response = await fetch('/api/inventory');
		const result = await response.json();

		if (result.error) {
			throw new Error(result.error);
		}

		return {
			stats: result.data.stats,
			inventory: result.data.batches, // This contains the platform/tier account data
			lowStockThreshold: Number(result.data?.stats?.low_stock_threshold || 10),
			lowStockPolicy: result.data?.low_stock_policy || null
		};
	} catch (error) {
		console.error('Error loading inventory:', error);
		return {
			stats: {
				total_accounts: 0,
				lifetime_total_accounts: 0,
				available_accounts: 0,
				reserved_accounts: 0,
				platforms: 0,
				low_stock_threshold: 10
			},
			inventory: [],
			lowStockThreshold: 10,
			lowStockPolicy: null,
			error: error instanceof Error ? error.message : 'Failed to load inventory'
		};
	}
};
