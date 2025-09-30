import { getBatches } from '$lib/services/batches';
import { supabase } from '$lib/supabase';

export const load = async () => {
	const [batchesResult, tiersResult] = await Promise.all([
		getBatches(),
		supabase
			.from('categories')
			.select('id, name, slug, metadata')
			.eq('category_type', 'tier')
			.order('sort_order')
	]);

	return {
		batches: batchesResult.data || [],
		error: batchesResult.error?.message || null,
		tiers: tiersResult.data || []
	};
};
