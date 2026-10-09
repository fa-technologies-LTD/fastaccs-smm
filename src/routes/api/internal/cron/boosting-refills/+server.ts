import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runBoostRefillWorker } from '$lib/server/boosting-providers/refill-worker';

export const config = { maxDuration: 60 };
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-refills',
		work: () => runBoostRefillWorker()
	});
