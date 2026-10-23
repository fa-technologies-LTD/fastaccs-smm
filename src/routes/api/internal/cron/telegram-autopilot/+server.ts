import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { isCronAuthorized } from '$lib/server/cron-dispatcher';
import { autopilotModeNow, runAutopilotJob } from '$lib/server/autopilot/job';

// Telegram marketing autopilot: finds channels, talks to admins within the owner's limits, and
// asks the owner to approve every payment. Called on the minutes other jobs already wake the
// database: a full run every 15 minutes (logged as an automation run), and in between a quick
// reply check only while there are conversations to follow (not logged, to keep the log small).
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
	if (mode === 'replies') {
		try {
			return json({ success: true, data: await runAutopilotJob('replies') });
		} catch (error) {
			console.error('[cron.telegram-autopilot] quick reply check failed:', error);
			return json({ success: false, error: 'Quick reply check failed' }, { status: 500 });
		}
	}
	return json({ success: true, data: { skipped: 'nothing_due' } });
};
