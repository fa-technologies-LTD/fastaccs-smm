import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { reconcilePendingPaymentBacklog } from '$lib/services/payment-reconciliation';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'payments-reconcile',
		work: () => reconcilePendingPaymentBacklog({ limit: 50, maxRounds: 3 })
	});
