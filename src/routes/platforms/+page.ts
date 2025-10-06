import type { PageLoad } from './$types';

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

export const load: PageLoad = async ({ fetch }): Promise<PageData> => {
	try {
		// Get all platforms using the API
		const platformsResponse = await fetch('/api/categories?type=platform');
		if (!platformsResponse.ok) {
			console.error('Error fetching platforms:', await platformsResponse.text());
			return { platforms: [] };
		}

		const platformsResult = await platformsResponse.json();
		const platforms = platformsResult.data || [];

		// Get tier statistics for each platform
		const platformsWithStats = await Promise.all(
			platforms.map(
				async (platform: { id: string; name: string; slug: string; description: string }) => {
					try {
						// Get tiers for this platform
						const tiersResponse = await fetch(`/api/categories/tiers/${platform.id}`);
						let tiers: { id: string; name: string; slug: string }[] = [];

						if (tiersResponse.ok) {
							const tiersResult = await tiersResponse.json();
							tiers = tiersResult.data || [];
						} else {
							console.error(
								`Error fetching tiers for ${platform.name}:`,
								await tiersResponse.text()
							);
						}

						// For now, we'll just return basic platform info without account counts
						// since that requires complex inventory calculations
						return {
							id: platform.id,
							name: platform.name,
							slug: platform.slug,
							description: platform.description,
							tier_count: tiers.length,
							total_accounts: 0, // We can add this later via a dedicated inventory API if needed
							sample_tiers: tiers.slice(0, 6).map((tier) => ({
								name: tier.name,
								slug: tier.slug,
								price: 0 // Price info would come from products, but we'll keep it simple for now
							}))
						};
					} catch (error) {
						console.error(`Error processing platform ${platform.name}:`, error);
						return {
							id: platform.id,
							name: platform.name,
							slug: platform.slug,
							description: platform.description,
							tier_count: 0,
							total_accounts: 0,
							sample_tiers: []
						};
					}
				}
			)
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
