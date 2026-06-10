import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runOnboardingAutomation } from '$lib/services/lifecycle-email';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'onboarding',
		work: () => runOnboardingAutomation({ limit: 300 })
	});
