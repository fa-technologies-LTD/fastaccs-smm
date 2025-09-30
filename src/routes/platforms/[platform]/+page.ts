import type { PageLoad } from './$types';
import { supabase } from '$lib/supabase';
import { error } from '@sveltejs/kit';

export interface TierInventory {
	product_id: string;
	tier_name: string;
	tier_slug: string;
	category_id: string;
	category_name: string;
	metadata: Record<string, unknown>;
	accounts_available: number;
	reservations_active: number;
	visible_available: number;
	price: number;
	product_status: string;
	tier_active: boolean;
	platform_name: string;
	platform_slug: string;
}

export interface Platform {
	id: string;
	name: string;
	slug: string;
	description: string;
	metadata: Record<string, unknown>;
}

export interface PageData {
	platform: Platform | null;
	tiers: TierInventory[];
}

export const load: PageLoad = async ({ params }): Promise<PageData> => {
	const platformSlug = params.platform;

	try {
		// Get platform details
		const { data: platform, error: platformError } = await supabase
			.from('categories')
			.select('id, name, slug, description, metadata')
			.eq('slug', platformSlug)
			.eq('category_type', 'platform')
			.eq('is_active', true)
			.single();

		if (platformError || !platform) {
			console.error('Platform not found:', platformError);
			throw error(404, 'Platform not found');
		}

		// Get tiers for this platform using the tier inventory view
		const { data: tiers, error: tiersError } = await supabase
			.from('mv_tier_inventory')
			.select('*')
			.eq('platform_slug', platformSlug)
			.eq('tier_active', true)
			.eq('product_status', 'active')
			.order('tier_name');

		if (tiersError) {
			console.error('Error fetching tiers:', tiersError);
			return {
				platform,
				tiers: []
			};
		}

		return {
			platform,
			tiers: tiers || []
		};
	} catch (err) {
		console.error('Error in platform page load:', err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		throw error(500, 'Failed to load platform data');
	}
};
