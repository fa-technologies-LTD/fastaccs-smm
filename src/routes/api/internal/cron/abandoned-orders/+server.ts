import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runAbandonedOrderReminder } from '$lib/services/lifecycle-email';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'abandoned-orders',
		work: () => runAbandonedOrderReminder({ limit: 300 })
	});
