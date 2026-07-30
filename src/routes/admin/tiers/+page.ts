import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Get all tiers with their platforms
		const [tiersResponse, platformsResponse] = await Promise.all([
			fetch('/api/categories?type=tier&include_inactive=true'),
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

		// Numbers (auto-SMS) tiers are managed in /admin/numbers, not here — they're not
		// account stock, so keep them out of Tier Management.
		const tiers = ((tiersResult.data || []) as Array<{ metadata?: { delivery_mode?: string } }>).filter(
			(tier) => tier?.metadata?.delivery_mode !== 'auto_sms'
		);

		return {
			tiers,
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
