import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runNurtureSequence } from '$lib/services/lifecycle-email';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'nurture',
		work: () => runNurtureSequence({ limit: 300 })
	});
