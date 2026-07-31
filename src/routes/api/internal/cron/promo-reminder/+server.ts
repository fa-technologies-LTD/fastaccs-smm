import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendPromoReminderEmails } from '$lib/services/promo-reminder';

// Reminds customers who hold an unlocked, unused promo code — one reminder per code
// (deduped), personalised with their own code. Not sent to everyone.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'promo-reminder',
		work: () => sendPromoReminderEmails(300)
	});
