import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runBoostFulfillmentWorker } from '$lib/server/boosting-providers/fulfillment-worker';
import {
	alertBoostOrdersAwaitingFunds,
	alertLowBoostSupplierBalances
} from '$lib/server/boosting-providers/balance-alert';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-fulfillment',
		work: async () => {
			const result = await runBoostFulfillmentWorker({ limit: 20 });
			// Orders lower the supplier balance, so the funding alerts are checked here too (once a day per supplier).
			await alertBoostOrdersAwaitingFunds(result.awaitingProviders);
			await alertLowBoostSupplierBalances();
			return result;
		}
	});
