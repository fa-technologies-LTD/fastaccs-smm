import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runBoostingShadowRouter } from '$lib/server/boosting-providers/shadow-router';

// Intentionally absent from vercel.json. This phase records hypothetical route decisions and is
// run manually while fulfilment remains human-operated; no provider adapter can submit an order.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-shadow-route',
		work: () => runBoostingShadowRouter()
	});
