import { supabase } from '$lib/supabase';

// Type for metadata fields
export interface TierMetadata {
	description?: string;
	features?: string[];
	requirements?: string[];
	min_followers?: number;
	max_followers?: number;
	engagement_rate?: number;
	verification_required?: boolean;
	[key: string]: unknown;
}

export interface StockAlert {
	tier_name: string;
	platform_name: string;
	available: number;
	threshold: number;
	severity: 'low' | 'critical' | 'out_of_stock';
}

export interface StockMovement {
	id: string;
	tier_name: string;
	platform_name: string;
	type: 'sale' | 'reservation' | 'import' | 'cancellation';
	quantity: number;
	created_at: string;
	metadata?: Record<string, unknown>;
}

// Get real-time tier inventory
export async function getTierInventory() {
	const { data, error } = await supabase
		.from('mv_tier_inventory')
		.select('*')
		.order('platform_name, tier_name');

	return { data, error };
}

// Get inventory by platform
export async function getInventoryByPlatform(platformSlug: string) {
	const { data, error } = await supabase
		.from('mv_tier_inventory')
		.select('*')
		.eq('platform_slug', platformSlug)
		.order('tier_name');

	return { data, error };
}

// Get low stock alerts
export async function getLowStockAlerts(threshold: number = 10) {
	const { data, error } = await supabase
		.from('mv_tier_inventory')
		.select('*')
		.lt('visible_available', threshold)
		.order('visible_available');

	if (error) return { data: null, error };

	const alerts: StockAlert[] =
		data?.map((item) => ({
			tier_name: item.tier_name,
			platform_name: item.platform_name,
			available: item.visible_available,
			threshold,
			severity:
				item.visible_available === 0
					? 'out_of_stock'
					: item.visible_available < 5
						? 'critical'
						: 'low'
		})) || [];

	return { data: alerts, error: null };
}

// Get inventory stats
export async function getInventoryStats() {
	const { data, error } = await supabase.from('mv_tier_inventory').select('*');

	if (error) return { data: null, error };

	const stats = {
		total_tiers: data?.length || 0,
		total_available: data?.reduce((sum, item) => sum + item.accounts_available, 0) || 0,
		total_reserved: data?.reduce((sum, item) => sum + item.reservations_active, 0) || 0,
		out_of_stock: data?.filter((item) => item.visible_available === 0).length || 0,
		low_stock:
			data?.filter((item) => item.visible_available > 0 && item.visible_available < 10).length || 0,
		platforms: [...new Set(data?.map((item) => item.platform_name))].length
	};

	return { data: stats, error: null };
}

// Update stock quantity cache
export async function updateStockCache(productId: string) {
	// This would typically be called after batch imports or account status changes
	const { data: inventory } = await supabase
		.from('mv_tier_inventory')
		.select('visible_available')
		.eq('product_id', productId)
		.single();

	if (inventory) {
		const { data, error } = await supabase
			.from('products')
			.update({ stock_quantity: inventory.visible_available })
			.eq('id', productId)
			.select()
			.single();

		return { data, error };
	}

	return { data: null, error: { message: 'Inventory not found' } };
}

// Get stock movements (real-time activity)
export async function getStockMovements(limit: number = 20) {
	try {
		// Get recent orders (sales)
		const { data: orders } = await supabase
			.from('orders')
			.select(
				`
				id,
				created_at,
				total_amount,
				status
			`
			)
			.order('created_at', { ascending: false })
			.limit(limit / 2);

		// Get recent account status changes
		const { data: accounts } = await supabase
			.from('accounts')
			.select(
				`
				id,
				status,
				created_at,
				category:categories(
					name,
					parent:categories(name)
				)
			`
			)
			.in('status', ['sold', 'reserved', 'available'])
			.order('created_at', { ascending: false })
			.limit(limit / 2);

		// Combine and format movements
		const movements: StockMovement[] = [];

		// Add order movements
		orders?.forEach((order) => {
			movements.push({
				id: order.id,
				tier_name: 'Mixed Tiers', // Would need order line items for specific tiers
				platform_name: 'Multiple',
				type: 'sale',
				quantity: 1, // Default to 1, would need to count from order_items for actual quantity
				created_at: order.created_at,
				metadata: { total_amount: order.total_amount, status: order.status }
			});
		});

		// Add account status movements
		accounts?.forEach((account) => {
			// Handle nested category structure from Supabase
			let platformName = 'Unknown';
			let tierName = 'Unknown';

			if (account.category && Array.isArray(account.category) && account.category.length > 0) {
				const cat = account.category[0] as { name: string; parent?: Array<{ name: string }> };
				tierName = cat.name || 'Unknown';
				if (cat.parent && Array.isArray(cat.parent) && cat.parent.length > 0) {
					platformName = cat.parent[0].name || 'Unknown';
				}
			}

			movements.push({
				id: account.id,
				tier_name: tierName,
				platform_name: platformName,
				type:
					account.status === 'sold'
						? 'sale'
						: account.status === 'reserved'
							? 'reservation'
							: 'import',
				quantity: 1,
				created_at: account.created_at,
				metadata: { account_status: account.status }
			});
		});

		// Sort by date and limit
		movements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

		return { data: movements.slice(0, limit), error: null };
	} catch (error) {
		console.error('Error fetching stock movements:', error);
		return { data: [], error };
	}
}

// Get inventory movements (activity log) - Legacy function
export async function getInventoryMovements(limit: number = 50) {
	// This would typically query an audit/activity log table
	// For now, we'll get recent account status changes as a proxy
	const { data, error } = await supabase
		.from('accounts')
		.select(
			`
      id,
      status,
      created_at,
      delivered_at,
      category:categories(name, parent:categories(name))
    `
		)
		.order('created_at', { ascending: false })
		.limit(limit);

	return { data, error };
}
