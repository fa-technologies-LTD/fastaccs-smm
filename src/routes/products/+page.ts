import type { PageLoad } from './$types';
import { db } from '$lib/supabase';

export const load: PageLoad = async ({ url, parent }) => {
	await parent(); // Wait for layout auth

	const category = url.searchParams.get('category');
	const platform = url.searchParams.get('platform');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 12;
	const offset = (page - 1) * limit;

	try {
		// Get products
		const { data: products, error: productsError } = await db.getProducts({
			category: category || undefined,
			platform: platform || undefined,
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
		const { data: categories, error: categoriesError } = await db.getCategories();

		if (categoriesError) {
			console.error('Error fetching categories:', categoriesError);
		}

		return {
			products: products || [],
			categories: categories || [],
			currentPage: page,
			filters: {
				category,
				platform
			}
		};
	} catch (error) {
		console.error('Unexpected error:', error);
		return {
			products: [],
			categories: [],
			error: 'An unexpected error occurred'
		};
	}
};
