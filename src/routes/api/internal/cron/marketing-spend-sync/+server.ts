import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { getMarketingUsdNgnRate } from '$lib/services/marketing/fx';
import { syncPropellerSpend } from '$lib/services/marketing/spend-sources/propellerads';
import { isMarketingSchemaReady } from '$lib/services/marketing/schema-ready';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'marketing-spend-sync',
		work: async () => {
			if (!(await isMarketingSchemaReady()))
				return { skipped: true, reason: 'marketing-migration-pending', processed: 0 };
			const result = await syncPropellerSpend({
				usdNgnRate: await getMarketingUsdNgnRate(),
				days: 3
			});
			return { ...result, processed: result.rows };
		}
	});
