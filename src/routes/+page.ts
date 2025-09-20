import type { PageLoad } from './$types';
import { getProducts } from '$lib/services/products';
import { supabase } from '$lib/supabase';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const load: PageLoad = async () => {
	try {
		// Test direct Supabase connection first
		console.log('Testing Supabase connection...');
		console.log('SUPABASE_URL:', PUBLIC_SUPABASE_URL);
		console.log('SUPABASE_ANON_KEY:', PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing');

		// Test basic connection
		const { data: testData, error: testError } = await supabase
			.from('products')
			.select('count(*)', { count: 'exact' });

		console.log('Direct products count test:', { testData, testError });

		// Get featured products
		const { data: featuredProducts, error: featuredError } = await getProducts({
			limit: 8
		});

		console.log('Featured products result:', {
			data: featuredProducts,
			count: featuredProducts?.length || 0,
			error: featuredError
		});

		// Get categories
		const { data: categories, error: categoriesError } = await supabase
			.from('categories')
			.select('*')
			.eq('is_active', true)
			.order('sort_order');

		console.log('Categories result:', {
			data: categories,
			count: categories?.length || 0,
			error: categoriesError
		});

		// Get platform stats
		const { data: platformStats } = await supabase.from('products').select('platform');

		console.log('Platform stats result:', {
			data: platformStats,
			count: platformStats?.length || 0
		});

		// Count products per platform
		const platforms =
			platformStats?.reduce((acc: Record<string, number>, product) => {
				acc[product.platform] = (acc[product.platform] || 0) + 1;
				return acc;
			}, {}) || {};

		const result = {
			featuredProducts: featuredProducts || [],
			categories: categories || [],
			platformStats: platforms,
			errors: {
				featured: featuredError ? String(featuredError) : undefined,
				categories: categoriesError?.message
			}
		};

		console.log('Final homepage result:', result);

		return result;
	} catch (error) {
		console.error('Error loading homepage data:', error);
		return {
			featuredProducts: [],
			categories: [],
			platformStats: {},
			errors: {
				general: 'Failed to load data'
			}
		};
	}
};
