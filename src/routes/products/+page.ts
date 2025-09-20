import type { PageLoad } from './$types';
import { getProducts } from '$lib/services/products';
import { supabase } from '$lib/supabase';

export const load: PageLoad = async ({ url, parent }) => {
	await parent(); // Wait for layout auth

	const category = url.searchParams.get('category');
	const platform = url.searchParams.get('platform');
	const search = url.searchParams.get('search');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 12;
	const offset = (page - 1) * limit;

	try {
		// Get products with proper filters
		const { data: products, error: productsError } = await getProducts({
			platform: platform || undefined,
			search: search || undefined,
			limit,
			offset
		});

		if (productsError) {
			console.error('Error fetching products:', productsError);
			return {
				products: [],
				categories: [],
				error: 'Failed to load products'
			};
		}

		// Get categories for filtering
		const { data: categories, error: categoriesError } = await supabase
			.from('categories')
			.select('*')
			.eq('is_active', true)
			.order('sort_order');

		if (categoriesError) {
			console.error('Error fetching categories:', categoriesError);
		}

		return {
			products: products || [],
			categories: categories || [],
			currentPage: page,
			filters: {
				category,
				platform,
				search
			}
		};
	} catch (error) {
		console.error('Unexpected error:', error);
		return {
			products: [],
			categories: [],
			currentPage: page,
			error: 'Failed to load data'
		};
	}
};
