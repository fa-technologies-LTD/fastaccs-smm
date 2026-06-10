import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { runAutomationJob } from '$lib/server/automation-runner';
import { getManualAutomationWork, isManualAutomationJobName } from '$lib/server/automation-work';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}

	const jobName = String(params.job || '');
	if (!isManualAutomationJobName(jobName)) {
		return json(
			{ success: false, error: 'This automation job cannot be run manually.' },
			{ status: 400 }
		);
	}

	try {
		const result = await runAutomationJob({
			jobName,
			work: getManualAutomationWork(jobName)
		});
		return json({ success: true, data: result });
	} catch (error) {
		console.error('[admin.automation.run] failed', { jobName, error });
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Automation job failed.'
			},
			{ status: 500 }
		);
	}
};
