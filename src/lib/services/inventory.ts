// Overall inventory statistics
export interface InventoryStats {
	total_accounts: number;
	available_accounts: number;
	assigned_accounts: number;
	delivered_accounts: number;
	platforms: number;
	total_tiers: number;
	total_available: number;
	total_reserved: number;
	out_of_stock: number;
	low_stock: number;
	accountsInOutOfStockTiers: number;
	outOfStockTiersCount: number;
}

/**
 * Get overall inventory statistics (used by admin dashboard refresh)
 */
export async function getInventoryStats(): Promise<{
	data: InventoryStats | null;
	error?: string;
}> {
	try {
		const response = await fetch('/api/inventory?type=stats');
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const result = await response.json();
		return { data: result.data || result };
	} catch (error) {
		console.error('Failed to fetch inventory stats:', error);
		return { data: null, error: 'Failed to fetch inventory stats' };
	}
}
