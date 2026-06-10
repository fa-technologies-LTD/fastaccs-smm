import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { generateMissingExactPreviewThumbnails } from '$lib/services/exact-preview-thumbnails';

export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'exact-preview-thumbnails',
		work: () => generateMissingExactPreviewThumbnails({ limit: 6 })
	});
