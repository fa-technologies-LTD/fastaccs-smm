import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { prepopulateBoostingDraftSuggestions } from '$lib/server/boosting-providers/draft-suggestions';

// Manual setup/review helper. It creates hidden drafts and unapproved shadow routes only; it can
// neither publish an offer nor submit a supplier order.
export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'boosting-draft-suggestions',
		work: prepopulateBoostingDraftSuggestions
	});
