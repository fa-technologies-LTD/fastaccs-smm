import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sweepExpiredPhoneRentals, checkHubmanBalanceAndAlert } from '$lib/services/phone-fulfillment';

// Safety net behind the live client polling: resolves OTPs and auto-cancels +
// refunds any Numbers rental whose activation window has closed with no code.
// Also alerts (once/day) when the hub-man balance runs low.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'phone-rentals-sweep',
		work: async () => {
			const acted = await sweepExpiredPhoneRentals();
			await checkHubmanBalanceAndAlert();
			return { acted };
		}
	});
