import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { syncBoostProviderCatalogues } from '$lib/server/boosting-providers/catalog-sync';
import { refreshBoostAutoPrices } from '$lib/server/boosting-providers/pricing-controls';
import { alertLowBoostSupplierBalances } from '$lib/server/boosting-providers/balance-alert';

// Each provider currently returns roughly 6,000 services. The sync validates and persists them
// sequentially, so retain enough serverless headroom for a cold database and bounded retries.
export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-catalog-sync',
		work: async () => {
			const results = await syncBoostProviderCatalogues();
			// Fresh balances just arrived; warn the operators once a day if a supplier needs funding.
			await alertLowBoostSupplierBalances();
			const unavailable = results.filter((result) => result.status !== 'synced');
			if (unavailable.length > 0) {
				throw new Error(
					`Boosting catalogue refresh failed for ${unavailable.map((result) => result.provider).join(', ')}.`
				);
			}
			return {
				pricing: await refreshBoostAutoPrices(),
				processed: results.reduce((total, result) => total + result.servicesSeen, 0),
				failed: 0,
				results
			};
		}
	});
