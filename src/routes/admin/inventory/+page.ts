import type { PageLoad } from './$types';
import { supabase } from '$lib/supabase';
import type { PageData } from './types';

export const load: PageLoad = async (): Promise<PageData> => {
	try {
		// Load products, categories, and disclaimers
		const [productsResult, categoriesResult, disclaimersResult] = await Promise.all([
			supabase.from('products').select('*').order('created_at', { ascending: false }),

			supabase.from('categories').select('*').order('sort_order', { ascending: true }),

			supabase.from('disclaimers').select('*').order('sort_order', { ascending: true })
		]);

		return {
			products: productsResult.data || [],
			categories: categoriesResult.data || [],
			disclaimers: disclaimersResult.data || [],
			errors: {
				products: productsResult.error?.message,
				categories: categoriesResult.error?.message,
				disclaimers: disclaimersResult.error?.message
			}
		};
	} catch (error) {
		console.error('Error loading admin inventory data:', error);
		return {
			products: [],
			categories: [],
			disclaimers: [],
			errors: {
				general: 'Failed to load inventory data'
			}
		};
	}
};
