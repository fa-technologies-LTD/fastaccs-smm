import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	dispatchInternalCronJobs,
	isCronAuthorized,
	type InternalCronJob
} from '$lib/server/cron-dispatcher';

const DAILY_JOBS: InternalCronJob[] = [
	{ name: 'payments-reconcile', path: '/api/internal/cron/payments-reconcile' },
	{ name: 'winback', path: '/api/internal/cron/winback' },
	{ name: 'low-stock-alerts', path: '/api/internal/cron/low-stock-alerts' },
	{ name: 'abandoned-orders', path: '/api/internal/cron/abandoned-orders' },
	{ name: 'onboarding', path: '/api/internal/cron/onboarding' },
	{ name: 'exact-preview-thumbnails', path: '/api/internal/cron/exact-preview-thumbnails' }
];

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isCronAuthorized(request, 'scheduler.daily')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const results = await dispatchInternalCronJobs(url.origin, DAILY_JOBS);
	const success = results.every((result) => result.ok);

	return json(
		{
			success,
			data: {
				scope: 'daily',
				results
			}
		},
		{ status: success ? 200 : 500 }
	);
};
