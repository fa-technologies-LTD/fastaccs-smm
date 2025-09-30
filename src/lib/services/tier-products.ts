import { supabase } from '$lib/supabase';

// Types for tier-based products
export interface TierProduct {
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

export interface TierProductInsert {
	category_id: string;
	name: string;
	slug: string;
	description?: string | null;
	price: number;
	sku_type?: 'tier' | 'unique';
	screenshot_urls?: string[] | null;
	tags?: string[] | null;
	status?: 'active' | 'inactive' | 'out_of_stock';
	stock_quantity?: number;
}

export interface TierProductUpdate {
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

// Get all tier products
export async function getTierProducts() {
	const { data, error } = await supabase
		.from('products')
		.select(
			`
      *,
      category:categories(
        id,
        name,
        slug,
        category_type,
        metadata,
        parent:categories!parent_id(
          id,
          name,
          slug
        )
      )
    `
		)
		.eq('sku_type', 'tier')
		.order('created_at', { ascending: false });

	return { data, error };
}

// Get products by platform
export async function getProductsByPlatform(platformSlug: string) {
	const { data, error } = await supabase
		.from('products')
		.select(
			`
      *,
      category:categories!inner(
        id,
        name,
        slug,
        metadata,
        parent:categories!parent_id!inner(
          id,
          name,
          slug
        )
      )
    `
		)
		.eq('category.parent.slug', platformSlug)
		.eq('status', 'active')
		.order('category.sort_order');

	return { data, error };
}

// Create tier product
export async function createTierProduct(product: TierProductInsert) {
	const { data, error } = await supabase
		.from('products')
		.insert({
			...product,
			sku_type: 'tier'
		})
		.select()
		.single();

	return { data, error };
}

// Update tier product
export async function updateTierProduct(id: string, updates: TierProductUpdate) {
	const { data, error } = await supabase
		.from('products')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	return { data, error };
}

// Delete tier product
export async function deleteTierProduct(id: string) {
	const { data, error } = await supabase.from('products').delete().eq('id', id).select().single();

	return { data, error };
}

// Get product by tier category
export async function getProductByTier(categoryId: string) {
	const { data, error } = await supabase
		.from('products')
		.select('*')
		.eq('category_id', categoryId)
		.single();

	return { data, error };
}
