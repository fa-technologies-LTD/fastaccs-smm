import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';
import { runRestockMarketing } from '$lib/services/restock-marketing';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'low-stock-alerts',
		work: async () => {
			const lowStock = await sendLowStockAdminAlertIfNeeded('cron_low_stock');
			// Restock emails to customers (asked-for alerts + "your usual is back"). Isolated so a
			// failure here never stops the owner's low-stock alert.
			const restock = await runRestockMarketing().catch((error) => ({
				error: error instanceof Error ? error.message : 'failed'
			}));
			return { lowStock, restock };
		}
	});
