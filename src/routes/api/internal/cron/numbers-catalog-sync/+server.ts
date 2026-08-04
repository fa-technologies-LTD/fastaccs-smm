import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { syncNumbersCatalog } from '$lib/services/phone-catalog';
import { isHubmanConfigured } from '$lib/services/hubman';

// The sync fetches several large hub-man + pvapins payloads (per-country app lists) and upserts
// ~160 tiers; the two-source gap-fill pushes it past 120s, so give it the Pro-tier headroom.
export const config = { maxDuration: 300 };

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
