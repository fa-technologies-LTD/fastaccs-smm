import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendBoostingHealthReport } from '$lib/services/boosting-health-report-send';

// Twice a day (08:01 and 20:01 WAT): the owner's Boosting check — deliveries, failures by supplier
// service, customer reports, retries, track record and supplier balances. Reporting only.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-health-report',
		work: () => sendBoostingHealthReport()
	});
