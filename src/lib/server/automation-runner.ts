import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { getAutomationJob, type AutomationJobName } from '$lib/server/automation-jobs';

type AutomationJobStatus = 'running' | 'succeeded' | 'failed';

export interface AutomationRunResult<T> {
	executed: boolean;
	executionId: string;
	status: AutomationJobStatus | 'skipped_overlap';
	result?: T;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function safeErrorSummary(error: unknown): string {
	return String(
		error instanceof Error ? error.message : error || 'Unknown automation failure'
	).slice(0, 500);
}

function finiteCount(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

export function summarizeAutomationResult(result: unknown): {
	processedCount: number;
	failureCount: number;
} {
	if (!result || typeof result !== 'object' || Array.isArray(result)) {
		return { processedCount: 0, failureCount: 0 };
	}

	const record = result as Record<string, unknown>;
	const processedKeys = ['processed', 'checked', 'scanned', 'queued', 'sent', 'generated'];
	const failureKeys = ['failed', 'failureCount', 'errors'];

	const processedCount =
		processedKeys.map((key) => finiteCount(record[key])).find((value) => value !== null) ?? 0;
	const failureCount =
		failureKeys.map((key) => finiteCount(record[key])).find((value) => value !== null) ?? 0;

	return { processedCount, failureCount };
}

async function acquireAutomationLock(input: {
	jobName: AutomationJobName;
	executionId: string;
	lockTimeoutMinutes: number;
}): Promise<boolean> {
	const expiresAt = new Date(Date.now() + input.lockTimeoutMinutes * 60 * 1000);
	const acquired = await prisma.$queryRaw<Array<{ job_name: string }>>`
		INSERT INTO "automation_job_locks" (
			"job_name",
			"execution_id",
			"locked_at",
			"expires_at",
			"updated_at"
		)
		VALUES (
			${input.jobName},
			${input.executionId},
			NOW(),
			${expiresAt},
			NOW()
		)
		ON CONFLICT ("job_name") DO UPDATE
		SET
			"execution_id" = EXCLUDED."execution_id",
			"locked_at" = NOW(),
			"expires_at" = EXCLUDED."expires_at",
			"updated_at" = NOW()
		WHERE "automation_job_locks"."expires_at" <= NOW()
		RETURNING "job_name"
	`;

	return acquired.length > 0;
}

async function releaseAutomationLock(
	jobName: AutomationJobName,
	executionId: string
): Promise<void> {
	await prisma.automationJobLock.deleteMany({
		where: {
			jobName,
			executionId
		}
	});
}

export async function runAutomationJob<T>(input: {
	jobName: AutomationJobName;
	work: () => Promise<T>;
	scheduledAt?: Date | null;
	executionId?: string;
}): Promise<AutomationRunResult<T>> {
	const job = getAutomationJob(input.jobName);
	const executionId = input.executionId || randomUUID();
	const acquired = await acquireAutomationLock({
		jobName: input.jobName,
		executionId,
		lockTimeoutMinutes: job.lockTimeoutMinutes
	});

	if (!acquired) {
		return {
			executed: false,
			executionId,
			status: 'skipped_overlap'
		};
	}

	let runId: string | null = null;
	try {
		const run = await prisma.automationJobRun.create({
			data: {
				jobName: input.jobName,
				executionId,
				scheduledAt: input.scheduledAt || null,
				status: 'running'
			},
			select: { id: true }
		});
		runId = run.id;

		const result = await input.work();
		const summary = summarizeAutomationResult(result);
		await prisma.automationJobRun.update({
			where: { id: run.id },
			data: {
				status: 'succeeded',
				finishedAt: new Date(),
				processedCount: summary.processedCount,
				failureCount: summary.failureCount,
				result: toJsonValue(result),
				errorSummary: null
			}
		});

		return {
			executed: true,
			executionId,
			status: 'succeeded',
			result
		};
	} catch (error) {
		if (runId) {
			await prisma.automationJobRun
				.update({
					where: { id: runId },
					data: {
						status: 'failed',
						finishedAt: new Date(),
						failureCount: 1,
						errorSummary: safeErrorSummary(error)
					}
				})
				.catch((recordError) => {
					console.error('[automation.runner] failed to record job failure', {
						jobName: input.jobName,
						executionId,
						error: recordError
					});
				});
		}

		throw error;
	} finally {
		await releaseAutomationLock(input.jobName, executionId).catch((error) => {
			console.error('[automation.runner] failed to release lock', {
				jobName: input.jobName,
				executionId,
				error
			});
		});
	}
}
