import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runStoreCreditReminders } from '$lib/services/store-credit-reminder';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'store-credit-reminders',
		work: () => runStoreCreditReminders()
	});
