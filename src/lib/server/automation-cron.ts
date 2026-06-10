import { json } from '@sveltejs/kit';
import { isCronAuthorized } from '$lib/server/cron-dispatcher';
import { runAutomationJob } from '$lib/server/automation-runner';
import type { AutomationJobName } from '$lib/server/automation-jobs';

export async function runAuthorizedAutomationCron<T>(input: {
	request: Request;
	jobName: AutomationJobName;
	work: () => Promise<T>;
}): Promise<Response> {
	if (!isCronAuthorized(input.request, input.jobName)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const run = await runAutomationJob({
			jobName: input.jobName,
			work: input.work
		});
		return json({
			success: true,
			data: run
		});
	} catch (error) {
		console.error(`[cron.${input.jobName}] failed:`, error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : `${input.jobName} run failed`
			},
			{ status: 500 }
		);
	}
}
