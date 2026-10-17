import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { reviewOverdueBoostOrders } from '$lib/services/boosting-support-review';
import { emailBoostingAttention } from '$lib/services/boosting-attention-email';

export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-support-review',
		work: async () => ({
			...(await reviewOverdueBoostOrders()),
			emailAlerts: await emailBoostingAttention()
		})
	});
