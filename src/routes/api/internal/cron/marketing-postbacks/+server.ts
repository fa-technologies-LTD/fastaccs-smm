import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { dispatchAdPostbacks } from '$lib/services/marketing/postbacks';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'marketing-postbacks',
		work: async () => {
			const summary = await dispatchAdPostbacks({ limit: 25 });
			// "rejected" is a definitive network refusal; "held" waits for owner review.
			return { ...summary, processed: summary.examined, failed: summary.rejected };
		}
	});
