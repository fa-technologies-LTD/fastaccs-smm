import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	dispatchInternalCronJobs,
	isCronAuthorized,
	type InternalCronJob
} from '$lib/server/cron-dispatcher';

const WEEKLY_JOBS: InternalCronJob[] = [
	{ name: 'weekly-business-digest', path: '/api/internal/cron/weekly-business-digest' }
];

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isCronAuthorized(request, 'scheduler.weekly')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const results = await dispatchInternalCronJobs(url.origin, WEEKLY_JOBS);
	const success = results.every((result) => result.ok);

	return json(
		{
			success,
			data: {
				scope: 'weekly',
				results
			}
		},
		{ status: success ? 200 : 500 }
	);
};
