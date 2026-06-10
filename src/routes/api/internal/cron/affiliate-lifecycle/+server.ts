import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runAffiliateLifecycleEmailRecovery } from '$lib/services/affiliate-lifecycle-email';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'affiliate-lifecycle',
		work: () => runAffiliateLifecycleEmailRecovery(300)
	});
