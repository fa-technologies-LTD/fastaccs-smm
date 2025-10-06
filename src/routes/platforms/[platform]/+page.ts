import type { PageLoad } from './$types';
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

export const load: PageLoad = async ({ params, fetch }): Promise<PageData> => {
	const platformSlug = params.platform;

	try {
		// Get platform details using API
		const platformResponse = await fetch(`/api/categories/slug/${platformSlug}`);

		if (!platformResponse.ok) {
			console.error('Platform not found');
			throw error(404, 'Platform not found');
		}

		const platformResult = await platformResponse.json();
		const platform = platformResult.data;

		if (!platform) {
			throw error(404, 'Platform not found');
		}

		// Get tiers for this platform
		const tiersResponse = await fetch(`/api/categories/tiers/${platform.id}`);
		let tiers: TierInventory[] = [];

		if (tiersResponse.ok) {
			const tiersResult = await tiersResponse.json();
			// Convert tier data to TierInventory format
			tiers = (tiersResult.data || []).map(
				(tier: {
					id: string;
					name: string;
					slug: string;
					isActive: boolean;
					metadata?: Record<string, unknown>;
					accountCount: number;
					price: number;
					productId: string | null;
					productStatus: string;
				}) => ({
					product_id: tier.productId || tier.id,
					tier_name: tier.name,
					tier_slug: tier.slug,
					category_id: tier.id,
					category_name: tier.name,
					metadata: tier.metadata || {},
					accounts_available: tier.accountCount,
					reservations_active: 0, // No longer using database reservations - cart uses cookies
					visible_available: tier.accountCount,
					price: tier.price,
					product_status: tier.productStatus,
					tier_active: tier.isActive,
					platform_name: platform.name,
					platform_slug: platform.slug
				})
			);
		} else {
			console.error('Error fetching tiers:', await tiersResponse.text());
		}

		return {
			platform: {
				id: platform.id,
				name: platform.name,
				slug: platform.slug,
				description: platform.description,
				metadata: platform.metadata || {}
			},
			tiers
		};
	} catch (err) {
		console.error('Error in platform page load:', err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		throw error(500, 'Failed to load platform data');
	}
};
