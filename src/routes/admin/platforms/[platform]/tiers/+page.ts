import { getCategoryBySlug, getTiersByPlatform } from '$lib/services/categories';
import { error } from '@sveltejs/kit';

export const load = async ({ params }: { params: { platform: string } }) => {
	const platformSlug = params.platform as string;

	// Load platform info
	const platformResult = await getCategoryBySlug(platformSlug);
	if (platformResult.error || !platformResult.data) {
		throw error(404, `Platform '${platformSlug}' not found`);
	}

	const platform = platformResult.data;

	// Load tiers for this platform
	const tiersResult = await getTiersByPlatform(platform.id);

	return {
		platform,
		tiers: tiersResult.data || [],
		tiersError: tiersResult.error?.message || null
	};
};
