import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runNumbersCampaignTouches } from '$lib/services/numbers-campaign';

// Sends the currently-due touch of the Numbers launch campaign. No-op unless an admin
// has launched the campaign (post-prod), so it's safe to run every day.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'numbers-campaign',
		work: async () => {
			const result = await runNumbersCampaignTouches();
			return result;
		}
	});
