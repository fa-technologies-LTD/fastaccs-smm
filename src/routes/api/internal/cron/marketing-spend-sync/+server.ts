import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { getMarketingUsdNgnRate } from '$lib/services/marketing/fx';
import { syncPropellerSpend } from '$lib/services/marketing/spend-sources/propellerads';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'marketing-spend-sync',
		work: async () => {
			const result = await syncPropellerSpend({
				usdNgnRate: await getMarketingUsdNgnRate(),
				days: 3
			});
			return { ...result, processed: result.rows };
		}
	});
