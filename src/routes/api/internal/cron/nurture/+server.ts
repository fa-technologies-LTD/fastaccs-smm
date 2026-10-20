import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runNurtureSequence } from '$lib/services/lifecycle-email';
import { runVerificationReminders } from '$lib/services/verification-reminders';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'nurture',
		work: async () => {
			const nurture = await runNurtureSequence({ limit: 300 });
			// Up to two "confirm your email" reminders for accounts that never verified.
			const verificationReminders = await runVerificationReminders({ limit: 150 }).catch(
				(error) => ({ error: error instanceof Error ? error.message : 'failed' })
			);
			return { nurture, verificationReminders };
		}
	});
