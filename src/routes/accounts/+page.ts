import type { Load } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';

export const load: Load = async () => {
	try {
		// Get all products (accounts)
		const { data: accounts, error } = await supabase
			.from('products')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading accounts:', error);
			// Return empty array instead of throwing error to show empty state
			return {
				accounts: []
			};
		}

		// Transform the data to match the expected format
		const transformedAccounts =
			accounts?.map((account) => ({
				id: account.id,
				title: account.title,
				platform: account.platform,
				follower_count: account.follower_count || 0,
				following_count: account.following_count || 0,
				posts_count: account.posts_count || 0,
				created_date: account.created_at,
				category: account.niche || 'general',
				engagement_rate: account.engagement_rate || 0,
				verified: account.verification_status === 'verified',
				account_age_months: account.account_age_months || 0,
				two_factor_enabled: account.two_factor_enabled || false,
				easy_login_enabled: account.easy_login_enabled || false,
				price: account.price,
				images: account.screenshot_urls || [account.thumbnail_url].filter(Boolean)
			})) || [];

		return {
			accounts: transformedAccounts
		};
	} catch (err) {
		console.error('Error in accounts page loader:', err);
		return {
			accounts: []
		};
	}
};
