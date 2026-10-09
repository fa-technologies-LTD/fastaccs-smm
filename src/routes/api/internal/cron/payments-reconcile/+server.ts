import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { reconcilePendingPaymentBacklog } from '$lib/services/payment-reconciliation';
import { drainPaymentWebhookInbox } from '$lib/services/payment-webhook-inbox';
import { drainRefundRecovery } from '$lib/services/refund-recovery';
import { drainServerPurchaseAnalytics } from '$lib/services/payment-settlement';
import { drainRefundAnalytics } from '$lib/services/refund-analytics';

export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'payments-reconcile',
		work: async () => {
			const deadlineMs = Date.now() + 200_000;
			return {
				webhooks: await drainPaymentWebhookInbox(),
				refunds: await drainRefundRecovery(10, Math.min(deadlineMs, Date.now() + 40_000)),
				payments: await reconcilePendingPaymentBacklog({ limit: 50, maxRounds: 3, deadlineMs }),
				analytics: await drainServerPurchaseAnalytics(
					3,
					Math.min(deadlineMs + 50_000, Date.now() + 30_000)
				),
				refundAnalytics: await drainRefundAnalytics(
					3, Math.min(deadlineMs + 80_000, Date.now() + 30_000)
				)
			};
		}
	});
