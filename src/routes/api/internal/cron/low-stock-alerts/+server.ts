import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'low-stock-alerts',
		work: () => sendLowStockAdminAlertIfNeeded('cron_low_stock')
	});
