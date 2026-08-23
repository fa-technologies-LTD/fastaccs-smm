import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { runPhoneCatalogProbe } from '$lib/services/phone-catalog-probe';

export const config = { maxDuration: 120 };

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'numbers-catalog-probe',
		work: runPhoneCatalogProbe
	});
