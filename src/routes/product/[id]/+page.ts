import type { PageLoad } from './$types';
import { db } from '$lib/supabase';
import type { Tables } from '$lib/supabase';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, parent }) => {
	await parent(); // Wait for layout auth

	try {
		const { data: product, error: productError } = await db.getProduct(params.id);

		if (productError || !product) {
			throw error(404, 'Product not found');
		}

		// Get related products (same platform, different product)
		const { data: relatedProducts } = await db.getProducts({
			platform: product.platform,
			limit: 4
		});

		const related =
			relatedProducts?.filter((p: Tables<'products'>) => p.id !== product.id).slice(0, 3) || [];

		return {
			product,
			relatedProducts: related
		};
	} catch (err) {
		console.error('Error loading product:', err);
		throw error(500, 'Failed to load product');
	}
};
