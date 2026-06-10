import { prisma } from '$lib/prisma';
import {
	AUTOMATION_JOBS,
	type AutomationJobDefinition,
	type AutomationJobName
} from '$lib/server/automation-jobs';
import { getManuallyRunnableAutomationJobs } from '$lib/server/automation-work';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';

const FAILURE_ALERT_THRESHOLD = 2;
const HEALTH_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface AutomationHealthSummary {
	checked: number;
	healthy: number;
	unhealthy: number;
	unobserved: number;
	alertsSent: number;
	jobs: Array<{
		name: AutomationJobName;
		status: 'healthy' | 'unhealthy' | 'unobserved';
		lastRunAt: string | null;
		lastSuccessAt: string | null;
		consecutiveFailures: number;
		reason?: string;
	}>;
}

export interface AutomationDashboardJob {
	name: AutomationJobName;
	schedule: string;
	risk: AutomationJobDefinition['risk'];
	status: 'healthy' | 'unhealthy' | 'unobserved' | 'running' | 'disabled';
	lastRunAt: string | null;
	lastSuccessAt: string | null;
	latestProcessedCount: number;
	latestFailureCount: number;
	latestError: string | null;
	lockExpiresAt: string | null;
	manualRunAllowed: boolean;
}

function getOverdueThreshold(job: AutomationJobDefinition): Date {
	const graceMinutes = Math.max(job.expectedIntervalMinutes * 2.5, 30);
	return new Date(Date.now() - graceMinutes * 60 * 1000);
}

export async function evaluateAutomationHealth(): Promise<AutomationHealthSummary> {
	const jobs = Object.values(AUTOMATION_JOBS).filter(
		(job) => job.name !== 'automation-health' && !('enabled' in job && job.enabled === false)
	);
	const summary: AutomationHealthSummary = {
		checked: jobs.length,
		healthy: 0,
		unhealthy: 0,
		unobserved: 0,
		alertsSent: 0,
		jobs: []
	};

	for (const job of jobs) {
		const recentRuns = await prisma.automationJobRun.findMany({
			where: { jobName: job.name },
			orderBy: { startedAt: 'desc' },
			take: 5,
			select: {
				status: true,
				startedAt: true,
				finishedAt: true
			}
		});

		if (recentRuns.length === 0) {
			summary.unobserved += 1;
			summary.jobs.push({
				name: job.name,
				status: 'unobserved',
				lastRunAt: null,
				lastSuccessAt: null,
				consecutiveFailures: 0
			});
			continue;
		}

		const latestRun = recentRuns[0];
		const latestSuccess = recentRuns.find((run) => run.status === 'succeeded') || null;
		const consecutiveFailures = recentRuns.findIndex((run) => run.status === 'succeeded');
		const failureCount = consecutiveFailures === -1 ? recentRuns.length : consecutiveFailures;
		const overdue = latestRun.startedAt < getOverdueThreshold(job);
		const repeatedlyFailing = failureCount >= FAILURE_ALERT_THRESHOLD;
		const unhealthy = overdue || repeatedlyFailing;
		const reason = overdue
			? `No run observed within the expected ${job.schedule} window.`
			: repeatedlyFailing
				? `${failureCount} consecutive failures.`
				: undefined;

		if (!unhealthy) {
			summary.healthy += 1;
			summary.jobs.push({
				name: job.name,
				status: 'healthy',
				lastRunAt: latestRun.startedAt.toISOString(),
				lastSuccessAt: latestSuccess?.finishedAt?.toISOString() || null,
				consecutiveFailures: failureCount
			});
			continue;
		}

		summary.unhealthy += 1;
		summary.jobs.push({
			name: job.name,
			status: 'unhealthy',
			lastRunAt: latestRun.startedAt.toISOString(),
			lastSuccessAt: latestSuccess?.finishedAt?.toISOString() || null,
			consecutiveFailures: failureCount,
			reason
		});

		const alert = await sendCriticalAdminAlert({
			title: `Automation job unhealthy: ${job.name}`,
			message: `Job: ${job.name}
Expected schedule: ${job.schedule}
Last run: ${latestRun.startedAt.toISOString()}
Last successful run: ${latestSuccess?.finishedAt?.toISOString() || 'none observed'}
Consecutive failures: ${failureCount}
Reason: ${reason || 'Unknown health failure'}`,
			source: 'automation.health',
			dedupeKey: `automation-health:${job.name}`,
			cooldownMs: HEALTH_ALERT_COOLDOWN_MS
		});
		if (alert.sent) summary.alertsSent += 1;
	}

	return summary;
}

export async function getAutomationDashboardSnapshot(): Promise<AutomationDashboardJob[]> {
	const jobs = Object.values(AUTOMATION_JOBS);
	const [runsByJob, locks] = await Promise.all([
		Promise.all(
			jobs.map((job) =>
				prisma.automationJobRun.findMany({
					where: { jobName: job.name },
					orderBy: { startedAt: 'desc' },
					take: 5,
					select: {
						jobName: true,
						status: true,
						startedAt: true,
						finishedAt: true,
						processedCount: true,
						failureCount: true,
						errorSummary: true
					}
				})
			)
		),
		prisma.automationJobLock.findMany({
			select: {
				jobName: true,
				expiresAt: true
			}
		})
	]);

	const runnable = new Set<string>(getManuallyRunnableAutomationJobs());
	const lockByJob = new Map(locks.map((lock) => [lock.jobName, lock]));
	const now = new Date();

	return jobs.map((job, index) => {
		const jobRuns = runsByJob[index];
		const latest = jobRuns[0] || null;
		const latestSuccess = jobRuns.find((run) => run.status === 'succeeded') || null;
		const lock = lockByJob.get(job.name) || null;
		const activelyRunning = Boolean(lock && lock.expiresAt > now);
		const overdue = Boolean(latest && latest.startedAt < getOverdueThreshold(job));
		const latestFailures = jobRuns.findIndex((run) => run.status === 'succeeded');
		const consecutiveFailures = latestFailures === -1 ? jobRuns.length : latestFailures;
		const status: AutomationDashboardJob['status'] =
			'enabled' in job && job.enabled === false
				? 'disabled'
				: activelyRunning
					? 'running'
					: !latest
						? 'unobserved'
						: overdue || consecutiveFailures >= FAILURE_ALERT_THRESHOLD
							? 'unhealthy'
							: 'healthy';

		return {
			name: job.name as AutomationJobName,
			schedule: job.schedule,
			risk: job.risk,
			status,
			lastRunAt: latest?.startedAt.toISOString() || null,
			lastSuccessAt: latestSuccess?.finishedAt?.toISOString() || null,
			latestProcessedCount: latest?.processedCount || 0,
			latestFailureCount: latest?.failureCount || 0,
			latestError: latest?.errorSummary || null,
			lockExpiresAt: activelyRunning ? lock?.expiresAt.toISOString() || null : null,
			manualRunAllowed: runnable.has(job.name)
		};
	});
}
