import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { isCronAuthorized } from '$lib/server/cron-dispatcher';
import { autopilotModeNow, runAutopilotJob } from '$lib/server/autopilot/job';

// Every 15 minutes, check eligible groups for buyer questions and permitted promotions.
// The monitored cron records each run so a missed schedule is visible to the owner.
export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	if (!isCronAuthorized(request, 'telegram-autopilot')) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}
	const mode = await autopilotModeNow();
	if (mode === 'full') {
		return runAuthorizedAutomationCron({
			request,
			jobName: 'telegram-autopilot',
			work: () => runAutopilotJob('full')
		});
	}
	return json({ success: true, data: { skipped: 'nothing_due' } });
};
