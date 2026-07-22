import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { sendAffiliateAnnouncementEmails } from '$lib/services/affiliate-lifecycle-email';

// One-time, manually-triggered (not scheduled): announces the refreshed affiliate
// program to all active affiliates. Idempotent — safe to call more than once.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'affiliate-announcement',
		work: sendAffiliateAnnouncementEmails
	});
