import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { isCronAuthorized } from '$lib/server/cron-dispatcher';
import { autopilotModeNow, runAutopilotJob } from '$lib/server/autopilot/job';

// Telegram marketing autopilot: finds channels, talks to admins within the owner's limits, and
// asks the owner to approve every payment. Called every minute: a full run every 15 minutes
// (logged as an automation run); group chats at :09/:24/:39/:54; and in between a quick reply
// check only while there are conversations to follow (group and quick runs aren't logged).
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
	if (mode === 'replies' || mode === 'groups') {
		try {
			return json({ success: true, data: await runAutopilotJob(mode) });
		} catch (error) {
			console.error(`[cron.telegram-autopilot] ${mode} run failed:`, error);
			return json({ success: false, error: `The ${mode} run failed` }, { status: 500 });
		}
	}
	return json({ success: true, data: { skipped: 'nothing_due' } });
};
