import type { PageLoad } from './$types';
import { supabase } from '$lib/supabase';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, parent }) => {
	await parent(); // Wait for layout auth

	try {
		// Get the product by ID
		const { data: product, error: productError } = await supabase
			.from('products')
			.select('*')
			.eq('id', params.id)
			.eq('status', 'active')
			.single();

		if (productError || !product) {
			console.error('Product not found:', productError);
			throw error(404, 'Product not found');
		}

		// Get related products (same platform, different product)
		const { data: relatedProducts, error: relatedError } = await supabase
			.from('products')
			.select('*')
			.eq('platform', product.platform)
			.eq('status', 'active')
			.neq('id', product.id)
			.limit(3);

		if (relatedError) {
			console.error('Error loading related products:', relatedError);
		}

		return {
			product,
			relatedProducts: relatedProducts || []
		};
	} catch (err) {
		console.error('Error loading product:', err);
		throw error(500, 'Failed to load product');
	}
};
