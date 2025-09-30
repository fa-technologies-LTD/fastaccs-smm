import { getBatchById } from '$lib/services/batches';
import { getAccountsByBatch } from '$lib/services/accounts';
import { error } from '@sveltejs/kit';

export const load = async ({ params }: { params: { id: string } }) => {
	const batchId = params.id as string;

	// Load batch info
	const batchResult = await getBatchById(batchId);
	if (batchResult.error || !batchResult.data) {
		throw error(404, `Batch '${batchId}' not found`);
	}

	// Load accounts for this batch
	const accountsResult = await getAccountsByBatch(batchId);

	return {
		batch: batchResult.data,
		accounts: accountsResult.data || [],
		error: accountsResult.error?.message || null
	};
};
