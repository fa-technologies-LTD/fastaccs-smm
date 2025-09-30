import { supabase } from '$lib/supabase';

// Type for product metadata
export interface ProductMetadata {
	features?: string[];
	requirements?: string[];
	delivery_time?: string;
	warranty_period?: string;
	support_included?: boolean;
	access_type?: 'shared' | 'exclusive' | 'temporary';
	limitations?: string[];
	[key: string]: unknown;
}

// New schema types based on our tier system
export interface Category {
	id: string;
	parent_id: string | null;
	name: string;
	slug: string;
	description: string | null;
	category_type: 'platform' | 'tier' | 'service_group';
	metadata: ProductMetadata;
	sort_order: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Product {
	id: string;
	category_id: string;
	name: string;
	slug: string;
	description: string | null;
	price: number;
	sku_type: 'tier' | 'unique';
	screenshot_urls: string[] | null;
	tags: string[] | null;
	status: 'active' | 'inactive' | 'out_of_stock';
	stock_quantity: number;
	created_at: string;
	updated_at: string;
}

export interface ProductInsert {
	category_id: string;
	name: string;
	slug: string;
	description?: string | null;
	price: number;
	sku_type: 'tier' | 'unique';
	screenshot_urls?: string[] | null;
	tags?: string[] | null;
	status?: 'active' | 'inactive' | 'out_of_stock';
	stock_quantity?: number;
}

export interface ProductUpdate {
	category_id?: string;
	name?: string;
	slug?: string;
	description?: string | null;
	price?: number;
	sku_type?: 'tier' | 'unique';
	screenshot_urls?: string[] | null;
	tags?: string[] | null;
	status?: 'active' | 'inactive' | 'out_of_stock';
	stock_quantity?: number;
}

export interface TierInventory {
	product_id: string;
	tier_name: string;
	tier_slug: string;
	category_id: string;
	category_name: string;
	metadata: ProductMetadata;
	accounts_available: number;
	reservations_active: number;
	visible_available: number;
	price: number;
	product_status: string;
	tier_active: boolean;
	platform_name: string;
	platform_slug: string;
}

// Get all products with filtering and search
export async function getProducts(filters?: {
	platform?: string;
	status?: string;
	search?: string;
	limit?: number;
	offset?: number;
}) {
	try {
		console.log('getProducts called with filters:', filters);

		let query = supabase.from('products').select('*').order('created_at', { ascending: false });

		// Apply filters
		if (filters?.platform) {
			query = query.eq('platform', filters.platform);
		}

		if (filters?.status) {
			query = query.eq('status', filters.status);
		}

		if (filters?.search) {
			query = query.or(
				`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,platform.ilike.%${filters.search}%`
			);
		}

		if (filters?.limit) {
			query = query.limit(filters.limit);
		}

		if (filters?.offset) {
			query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
		}

		const { data, error } = await query;

		console.log('getProducts query result:', {
			data,
			count: data?.length || 0,
			error,
			query: query.toString()
		});

		if (error) {
			console.error('Error fetching products:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in getProducts:', error);
		return { data: null, error };
	}
}

// Get single product by ID
export async function getProduct(id: string) {
	try {
		const { data, error } = await supabase.from('products').select('*').eq('id', id).single();

		if (error) {
			console.error('Error fetching product:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in getProduct:', error);
		return { data: null, error };
	}
}

// Create new product
export async function createProduct(product: ProductInsert) {
	try {
		const { data, error } = await supabase.from('products').insert([product]).select().single();

		if (error) {
			console.error('Error creating product:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in createProduct:', error);
		return { data: null, error };
	}
}

// Update product
export async function updateProduct(id: string, updates: ProductUpdate) {
	try {
		const { data, error } = await supabase
			.from('products')
			.update(updates)
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('Error updating product:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in updateProduct:', error);
		return { data: null, error };
	}
}

// Delete product
export async function deleteProduct(id: string) {
	try {
		const { error } = await supabase.from('products').delete().eq('id', id);

		if (error) {
			console.error('Error deleting product:', error);
			return { success: false, error };
		}

		return { success: true, error: null };
	} catch (error) {
		console.error('Error in deleteProduct:', error);
		return { success: false, error };
	}
}

// Get product statistics for admin dashboard
export async function getProductStats() {
	try {
		// Get total products count
		const { count: totalProducts, error: totalError } = await supabase
			.from('products')
			.select('*', { count: 'exact', head: true });

		// Get available products count
		const { count: availableProducts, error: availableError } = await supabase
			.from('products')
			.select('*', { count: 'exact', head: true })
			.eq('status', 'active')
			.eq('is_sold', false);

		// Get low stock products (stock_quantity <= 2)
		const { count: lowStockProducts, error: lowStockError } = await supabase
			.from('products')
			.select('*', { count: 'exact', head: true })
			.lte('stock_quantity', 2)
			.eq('status', 'active')
			.eq('is_sold', false);

		// Get sold products count
		const { count: soldProducts, error: soldError } = await supabase
			.from('products')
			.select('*', { count: 'exact', head: true })
			.eq('is_sold', true);

		if (totalError || availableError || lowStockError || soldError) {
			const error = totalError || availableError || lowStockError || soldError;
			console.error('Error fetching product stats:', error);
			return { data: null, error };
		}

		return {
			data: {
				totalProducts: totalProducts || 0,
				availableProducts: availableProducts || 0,
				lowStockProducts: lowStockProducts || 0,
				soldProducts: soldProducts || 0
			},
			error: null
		};
	} catch (error) {
		console.error('Error in getProductStats:', error);
		return { data: null, error };
	}
}

// Get products by platform for filtering
export async function getProductPlatforms() {
	try {
		const { data, error } = await supabase.from('products').select('platform');

		if (error) {
			console.error('Error fetching platforms:', error);
			return { data: null, error };
		}

		// Extract unique platforms from the results
		const platforms = [...new Set(data?.map((item) => item.platform))];
		return { data: platforms, error: null };
	} catch (error) {
		console.error('Error in getProductPlatforms:', error);
		return { data: null, error };
	}
}

// Mark product as sold (update inventory)
export async function markProductAsSold(id: string) {
	try {
		const { data, error } = await supabase
			.from('products')
			.update({
				is_sold: true,
				status: 'sold',
				stock_quantity: 0
			})
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('Error marking product as sold:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in markProductAsSold:', error);
		return { data: null, error };
	}
}

// Bulk operations
export async function bulkUpdateProducts(productIds: string[], updates: ProductUpdate) {
	try {
		const { data, error } = await supabase
			.from('products')
			.update(updates)
			.in('id', productIds)
			.select();

		if (error) {
			console.error('Error bulk updating products:', error);
			return { data: null, error };
		}

		return { data, error: null };
	} catch (error) {
		console.error('Error in bulkUpdateProducts:', error);
		return { data: null, error };
	}
}
