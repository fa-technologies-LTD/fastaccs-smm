import { supabase } from '$lib/supabase';

// Type for category metadata
export interface CategoryMetadata {
	icon?: string;
	color?: string;
	logo_url?: string;
	website_url?: string;
	api_info?: {
		base_url?: string;
		rate_limits?: Record<string, number>;
		auth_methods?: string[];
	};
	platform_info?: {
		followers_range?: [number, number];
		content_types?: string[];
		demographics?: string[];
	};
	[key: string]: unknown;
}

// Types based on new schema
export interface Category {
	id: string;
	parent_id: string | null;
	name: string;
	slug: string;
	description: string | null;
	category_type: 'platform' | 'tier' | 'service_group';
	metadata: CategoryMetadata;
	sort_order: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface CategoryInsert {
	parent_id?: string | null;
	name: string;
	slug: string;
	description?: string | null;
	category_type: 'platform' | 'tier' | 'service_group';
	metadata?: CategoryMetadata;
	sort_order?: number;
	is_active?: boolean;
}

export interface CategoryUpdate {
	parent_id?: string | null;
	name?: string;
	slug?: string;
	description?: string | null;
	category_type?: 'platform' | 'tier' | 'service_group';
	metadata?: CategoryMetadata;
	sort_order?: number;
	is_active?: boolean;
}

// Get all platforms
export async function getPlatforms() {
	try {
		const response = await fetch('/api/admin/categories?category_type=platform');
		const result = await response.json();

		if (!response.ok) {
			return { data: null, error: { message: result.error } };
		}

		return { data: result.data, error: null };
	} catch {
		return { data: null, error: { message: 'Network error' } };
	}
}

// Get tiers for a platform
export async function getTiersByPlatform(platformId: string) {
	try {
		const response = await fetch(
			`/api/admin/categories?category_type=tier&parent_id=${platformId}`
		);
		const result = await response.json();

		if (!response.ok) {
			return { data: null, error: { message: result.error } };
		}

		return { data: result.data, error: null };
	} catch {
		return { data: null, error: { message: 'Network error' } };
	}
}

// Get all categories with hierarchy
export async function getCategoriesWithHierarchy() {
	const { data, error } = await supabase
		.from('categories')
		.select(
			`
      *,
      children:categories!parent_id(*)
    `
		)
		.eq('category_type', 'platform')
		.eq('is_active', true)
		.order('sort_order');

	return { data, error };
}

// Create platform
export async function createPlatform(platform: Omit<CategoryInsert, 'category_type'>) {
	const { data, error } = await supabase
		.from('categories')
		.insert({
			...platform,
			category_type: 'platform'
		})
		.select()
		.single();

	return { data, error };
}

// Create tier under platform
export async function createTier(tier: Omit<CategoryInsert, 'category_type'>) {
	const { data, error } = await supabase
		.from('categories')
		.insert({
			...tier,
			category_type: 'tier'
		})
		.select()
		.single();

	return { data, error };
}

// Update category
export async function updateCategory(id: string, updates: CategoryUpdate) {
	const { data, error } = await supabase
		.from('categories')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	return { data, error };
}

// Delete category (soft delete)
export async function deleteCategory(id: string) {
	try {
		const response = await fetch(`/api/admin/categories?id=${id}`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		const result = await response.json();

		if (!response.ok) {
			return { data: null, error: { message: result.error } };
		}

		return { data: { success: true }, error: null };
	} catch {
		return { data: null, error: { message: 'Network error occurred' } };
	}
}

// Hard delete category (if no dependencies)
export async function hardDeleteCategory(id: string) {
	const { data, error } = await supabase.from('categories').delete().eq('id', id).select().single();

	return { data, error };
}

// Get category by slug
export async function getCategoryBySlug(slug: string) {
	const { data, error } = await supabase
		.from('categories')
		.select('*')
		.eq('slug', slug)
		.eq('is_active', true)
		.single();

	return { data, error };
}

// Generic create category function
export async function createCategory(category: CategoryInsert) {
	try {
		const response = await fetch('/api/admin/categories', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(category)
		});

		const result = await response.json();

		if (!response.ok) {
			return { data: null, error: { message: result.error } };
		}

		return { data: result.data, error: null };
	} catch {
		return { data: null, error: { message: 'Network error' } };
	}
}
