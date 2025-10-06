import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Get all tiers with their platforms
		const [tiersResponse, platformsResponse] = await Promise.all([
			fetch('/api/categories?type=tier'),
			fetch('/api/categories?type=platform')
		]);

		const tiersResult = await tiersResponse.json();
		const platformsResult = await platformsResponse.json();

		if (!tiersResponse.ok) {
			return {
				tiers: [],
				platforms: [],
				error: tiersResult.error || 'Failed to load tiers'
			};
		}

		return {
			tiers: tiersResult.data || [],
			platforms: platformsResult.data || [],
			error: null
		};
	} catch (error) {
		console.error('Failed to load tiers:', error);
		return {
			tiers: [],
			platforms: [],
			error: 'Failed to load tiers'
		};
	}
};
