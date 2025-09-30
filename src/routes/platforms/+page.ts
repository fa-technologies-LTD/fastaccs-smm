import type { PageLoad } from './$types';
import { supabase } from '$lib/supabase';

export interface Platform {
	id: string;
	name: string;
	slug: string;
	description: string;
	tier_count?: number;
	total_accounts?: number;
	sample_tiers?: Array<{
		name: string;
		slug: string;
		price: number;
	}>;
}

export interface PageData {
	platforms: Platform[];
}

export const load: PageLoad = async (): Promise<PageData> => {
	try {
		// Get all platforms (parent categories)
		const { data: platforms, error: platformsError } = await supabase
			.from('categories')
			.select('id, name, slug, description')
			.eq('category_type', 'platform')
			.eq('is_active', true)
			.order('sort_order');

		if (platformsError) {
			console.error('Error fetching platforms:', platformsError);
			return { platforms: [] };
		}

		// Get tier statistics for each platform
		const platformsWithStats = await Promise.all(
			(platforms || []).map(async (platform) => {
				try {
					// Get tier count and sample tiers for this platform
					const { data: tiers, error: tiersError } = await supabase
						.from('categories')
						.select(
							`
							id, name, slug,
							products!inner(price)
						`
						)
						.eq('parent_id', platform.id)
						.eq('category_type', 'tier')
						.eq('is_active', true)
						.order('sort_order')
						.limit(6);

					if (tiersError) {
						console.error(`Error fetching tiers for ${platform.name}:`, tiersError);
					}

					// Get total account count for this platform using the inventory view
					const { data: inventory, error: inventoryError } = await supabase
						.from('mv_tier_inventory')
						.select('accounts_available')
						.eq('platform_slug', platform.slug);

					if (inventoryError) {
						console.error(`Error fetching inventory for ${platform.name}:`, inventoryError);
					}

					const totalAccounts =
						inventory?.reduce((sum, item) => sum + (item.accounts_available || 0), 0) || 0;

					return {
						...platform,
						tier_count: tiers?.length || 0,
						total_accounts: totalAccounts,
						sample_tiers:
							tiers?.map((tier) => ({
								name: tier.name,
								slug: tier.slug,
								price: tier.products?.[0]?.price || 0
							})) || []
					};
				} catch (error) {
					console.error(`Error processing platform ${platform.name}:`, error);
					return {
						...platform,
						tier_count: 0,
						total_accounts: 0,
						sample_tiers: []
					};
				}
			})
		);

		return {
			platforms: platformsWithStats
		};
	} catch (error) {
		console.error('Error in platforms page load:', error);
		return {
			platforms: []
		};
	}
};
