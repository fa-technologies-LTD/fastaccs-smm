import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { dispatchAdPostbacks } from '$lib/services/marketing/postbacks';
import { isMarketingSchemaReady } from '$lib/services/marketing/schema-ready';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'marketing-postbacks',
		work: async () => {
			if (!(await isMarketingSchemaReady()))
				return { skipped: true, reason: 'marketing-migration-pending', processed: 0, failed: 0 };
			const summary = await dispatchAdPostbacks({ limit: 25 });
			// "rejected" is a definitive network refusal; "held" waits for owner review.
			return { ...summary, processed: summary.examined, failed: summary.rejected };
		}
	});
