import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendWeeklyBusinessDigest } from '$lib/services/weekly-business-digest';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'weekly-business-digest',
		work: sendWeeklyBusinessDigest
	});
