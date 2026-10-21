import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runAutopilotJob } from '$lib/server/autopilot/job';

// Telegram marketing autopilot: finds channels, talks to admins within the owner's limits, and
// asks the owner to approve every payment. A no-op while it is switched off.
export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'telegram-autopilot',
		work: runAutopilotJob
	});
