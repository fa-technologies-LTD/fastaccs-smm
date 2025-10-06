import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		// Get inventory data (our accounts)
		const inventoryResponse = await fetch('/api/inventory');
		const inventoryResult = await inventoryResponse.json();

		// Get platforms
		const platformsResponse = await fetch('/api/categories?type=platform');
		const platformsResult = await platformsResponse.json();

		// Transform inventory data into featured accounts format
		const featuredAccounts = [];
		if (inventoryResult.data?.categories) {
			// Take first few categories and their accounts as featured
			for (const category of inventoryResult.data.categories.slice(0, 8)) {
				if (category.accounts && category.accounts.length > 0) {
					const account = category.accounts[0]; // Take first account from each category
					featuredAccounts.push({
						id: account.id,
						title: `${category.name} Account - @${account.username}`,
						platform: category.parent?.name || category.name,
						price: account.price || 15000,
						original_price: account.originalPrice || null,
						follower_count: account.followers,
						verification_status: account.verified ? 'verified' : 'unverified',
						username: account.username,
						categoryId: category.id
					});
				}
			}
		}

		return {
			featuredProducts: featuredAccounts,
			categories: platformsResult.data || [],
			platformStats: inventoryResult.data?.stats || {},
			errors: {}
		};
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
