import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const { platform, tier } = params;

	try {
		// Get platform data
		const platformResponse = await fetch(`/api/categories/slug/${platform}`);
		if (!platformResponse.ok) {
			throw error(404, 'Platform not found');
		}
		const platformResult = await platformResponse.json();
		const platformData = platformResult.data;

		if (!platformData) {
			throw error(404, 'Platform not found');
		}

		// Get tier data by slug (we need to find the tier by slug)
		const tiersResponse = await fetch(`/api/categories/tiers/${platformData.id}`);
		if (!tiersResponse.ok) {
			throw error(404, 'Tiers not found');
		}
		const tiersResult = await tiersResponse.json();
		const tiers = tiersResult.data || [];

		// Find the specific tier by slug
		const tierData = tiers.find((t: { slug: string }) => t.slug === tier);
		if (!tierData) {
			throw error(404, 'Tier not found');
		}

		// Use the actual tier data (Category) for cart - no mock product needed

		// Create tier data in the expected format
		const tierInventoryData = {
			product_id: tierData.id,
			tier_name: tierData.name,
			tier_slug: tierData.slug,
			category_id: tierData.id,
			category_name: tierData.name,
			description: tierData.description, // Add description field
			metadata: tierData.metadata || {},
			accounts_available: tierData.accountCount || 0, // Use actual account count
			reservations_active: 0, // No longer using database reservations
			visible_available: tierData.accountCount || 0,
			price:
				typeof tierData.metadata === 'object' &&
				tierData.metadata !== null &&
				'price' in tierData.metadata
					? Number(tierData.metadata.price)
					: 0, // Get price from tier metadata
			product_status: 'active',
			tier_active: tierData.isActive,
			platform_name: platformData.name,
			platform_slug: platformData.slug
		};

		return {
			platform: platformData,
			tier: tierInventoryData,
			tierCategory: tierData // Pass the actual Category data for cart
		};
	} catch (err) {
		console.error('Error loading tier data:', err);
		throw error(500, 'Failed to load tier information');
	}
};
