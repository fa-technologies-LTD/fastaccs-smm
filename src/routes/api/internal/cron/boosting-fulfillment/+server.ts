import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runBoostFulfillmentWorker } from '$lib/server/boosting-providers/fulfillment-worker';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-fulfillment',
		work: () => runBoostFulfillmentWorker({ limit: 20 })
	});
