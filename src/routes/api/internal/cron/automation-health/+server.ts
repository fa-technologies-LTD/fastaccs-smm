import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { evaluateAutomationHealth } from '$lib/services/automation-health';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'automation-health',
		work: evaluateAutomationHealth
	});
