import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runNumbersCampaignTouches } from '$lib/services/numbers-campaign';

// Sends due Numbers discovery and no-code recovery messages. Each stream is
// independently owner-controlled and is a safe no-op while disabled.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'numbers-campaign',
		work: async () => {
			const result = await runNumbersCampaignTouches();
			return result;
		}
	});
