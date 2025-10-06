import { getBatches } from '$lib/services/batches';

export const load = async ({ fetch }) => {
	const [batchesResult, platformsResult, tiersResult] = await Promise.all([
		getBatches(fetch),
		fetch('/api/categories?type=platform').then((res) => res.json()),
		fetch('/api/categories?type=tier').then((res) => res.json())
	]);

	return {
		batches: batchesResult.data || [],
		platforms: platformsResult.data || [],
		tiers: tiersResult.data || [],
		error: batchesResult.error?.message || null
	};
};
