import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBroadcastBatchConfig, processBroadcastBatch } from '$lib/services/admin-broadcast';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	const broadcastId = String(params.id || '').trim();
	if (!isUuid(broadcastId)) {
		return json({ success: false, error: 'Invalid broadcast id.' }, { status: 400 });
	}

	const config = getBroadcastBatchConfig();
	const { processed, progress } = await processBroadcastBatch(broadcastId, config.batchSize);

	if (!progress) {
		return json({ success: false, error: 'Broadcast not found.' }, { status: 404 });
	}

	return json({
		success: true,
		data: {
			processed,
			progress,
			done: progress.pending === 0,
			batchConfig: config
		}
	});
};
