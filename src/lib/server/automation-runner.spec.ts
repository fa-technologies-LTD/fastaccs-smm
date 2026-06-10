import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	automationJobLock: {
		deleteMany: vi.fn()
	},
	automationJobRun: {
		create: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

import { runAutomationJob, summarizeAutomationResult } from './automation-runner';

describe('automation runner', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$queryRaw.mockResolvedValue([{ job_name: 'onboarding' }]);
		prismaMock.automationJobRun.create.mockResolvedValue({ id: 'run-1' });
		prismaMock.automationJobRun.update.mockResolvedValue({ id: 'run-1' });
		prismaMock.automationJobLock.deleteMany.mockResolvedValue({ count: 1 });
	});

	it('summarizes common job result counters', () => {
		expect(summarizeAutomationResult({ checked: 12, failed: 2 })).toEqual({
			processedCount: 12,
			failureCount: 2
		});
	});

	it('skips safely when another invocation owns the job lock', async () => {
		prismaMock.$queryRaw.mockResolvedValue([]);
		const work = vi.fn();

		const result = await runAutomationJob({
			jobName: 'onboarding',
			executionId: 'overlap-attempt',
			work
		});

		expect(result.status).toBe('skipped_overlap');
		expect(result.executed).toBe(false);
		expect(work).not.toHaveBeenCalled();
		expect(prismaMock.automationJobRun.create).not.toHaveBeenCalled();
	});

	it('records success and releases the lock', async () => {
		const result = await runAutomationJob({
			jobName: 'onboarding',
			executionId: 'successful-run',
			work: async () => ({ queued: 4, sent: 4, failed: 0 })
		});

		expect(result.status).toBe('succeeded');
		expect(prismaMock.automationJobRun.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'succeeded',
					processedCount: 4,
					failureCount: 0
				})
			})
		);
		expect(prismaMock.automationJobLock.deleteMany).toHaveBeenCalledWith({
			where: {
				jobName: 'onboarding',
				executionId: 'successful-run'
			}
		});
	});

	it('records failure, releases the lock, and preserves the original error', async () => {
		await expect(
			runAutomationJob({
				jobName: 'onboarding',
				executionId: 'failed-run',
				work: async () => {
					throw new Error('controlled failure');
				}
			})
		).rejects.toThrow('controlled failure');

		expect(prismaMock.automationJobRun.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'failed',
					failureCount: 1,
					errorSummary: 'controlled failure'
				})
			})
		);
		expect(prismaMock.automationJobLock.deleteMany).toHaveBeenCalled();
	});
});
