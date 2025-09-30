import { error } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const { platform, tier } = params;

	try {
		// Get platform data
		const { data: platformData, error: platformError } = await supabase
			.from('categories')
			.select('id, name, slug, metadata')
			.eq('slug', platform)
			.eq('type', 'platform')
			.single();

		if (platformError || !platformData) {
			throw error(404, 'Platform not found');
		}

		// Get tier data with inventory information AND the actual product
		const { data: tierData, error: tierError } = await supabase
			.from('mv_tier_inventory')
			.select('*')
			.eq('platform_slug', platform)
			.eq('tier_slug', tier)
			.single();

		if (tierError || !tierData) {
			throw error(404, 'Tier not found');
		}

		// Get the actual product record for cart integration
		const { data: productData, error: productError } = await supabase
			.from('products')
			.select('*')
			.eq('id', tierData.product_id)
			.single();

		if (productError || !productData) {
			throw error(404, 'Product not found');
		}

		return {
			platform: platformData,
			tier: tierData,
			product: productData
		};
	} catch (err) {
		console.error('Error loading tier data:', err);
		throw error(500, 'Failed to load tier information');
	}
};
