import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runBoostFulfillmentWorker } from '$lib/server/boosting-providers/fulfillment-worker';
import { alertLowBoostSupplierBalances } from '$lib/server/boosting-providers/balance-alert';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-fulfillment',
		work: async () => {
			const result = await runBoostFulfillmentWorker({ limit: 20 });
			// Orders lower the supplier balance, so the funding alert is checked here too (once a day per supplier).
			await alertLowBoostSupplierBalances();
			return result;
		}
	});
