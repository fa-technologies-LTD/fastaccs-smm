import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { syncNumbersCatalog } from '$lib/services/phone-catalog';
import { isHubmanConfigured } from '$lib/services/hubman';

// Keeps the Numbers storefront in sync with hub-man's rotating availability: adds newly
// available country×app combos, deactivates ones that lost stock, and re-prices from the
// current rate + margin. No-op when hub-man isn't configured.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'numbers-catalog-sync',
		work: async () => {
			if (!isHubmanConfigured()) return { skipped: 'hubman not configured' };
			return syncNumbersCatalog();
		}
	});
