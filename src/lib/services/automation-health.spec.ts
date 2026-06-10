import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	automationJobRun: {
		findMany: vi.fn()
	},
	automationJobLock: {
		findMany: vi.fn()
	}
}));
const sendCriticalAdminAlertMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/admin-alerts', () => ({
	sendCriticalAdminAlert: sendCriticalAdminAlertMock
}));

import { evaluateAutomationHealth, getAutomationDashboardSnapshot } from './automation-health';

describe('automation health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sendCriticalAdminAlertMock.mockResolvedValue({ sent: true });
		prismaMock.automationJobLock.findMany.mockResolvedValue([]);
	});

	it('treats jobs without history as unobserved without creating an alert storm', async () => {
		prismaMock.automationJobRun.findMany.mockResolvedValue([]);

		const summary = await evaluateAutomationHealth();

		expect(summary.unobserved).toBe(summary.checked);
		expect(summary.unhealthy).toBe(0);
		expect(sendCriticalAdminAlertMock).not.toHaveBeenCalled();
	});

	it('alerts after controlled consecutive failures', async () => {
		const now = new Date();
		prismaMock.automationJobRun.findMany.mockImplementation(
			async ({ where }: { where: { jobName: string } }) => {
				if (where.jobName !== 'onboarding') {
					return [
						{
							status: 'succeeded',
							startedAt: now,
							finishedAt: now
						}
					];
				}

				return [
					{ status: 'failed', startedAt: now, finishedAt: now },
					{ status: 'failed', startedAt: now, finishedAt: now },
					{ status: 'succeeded', startedAt: now, finishedAt: now }
				];
			}
		);

		const summary = await evaluateAutomationHealth();

		expect(summary.unhealthy).toBe(1);
		expect(summary.alertsSent).toBe(1);
		expect(sendCriticalAdminAlertMock).toHaveBeenCalledWith(
			expect.objectContaining({
				dedupeKey: 'automation-health:onboarding'
			})
		);
	});

	it('builds a read-only dashboard snapshot with restricted manual controls', async () => {
		const now = new Date();
		prismaMock.automationJobRun.findMany.mockImplementation(
			async ({ where }: { where: { jobName: string } }) =>
				where.jobName === 'payments-reconcile'
					? [
							{
								jobName: 'payments-reconcile',
								status: 'succeeded',
								startedAt: now,
								finishedAt: now,
								processedCount: 12,
								failureCount: 0,
								errorSummary: null
							}
						]
					: []
		);

		const jobs = await getAutomationDashboardSnapshot();
		const paymentJob = jobs.find((job) => job.name === 'payments-reconcile');
		const previewJob = jobs.find((job) => job.name === 'exact-preview-thumbnails');
		const abandonedJob = jobs.find((job) => job.name === 'abandoned-orders');

		expect(paymentJob).toEqual(
			expect.objectContaining({
				status: 'healthy',
				latestProcessedCount: 12,
				manualRunAllowed: false
			})
		);
		expect(previewJob).toEqual(
			expect.objectContaining({
				status: 'unobserved',
				manualRunAllowed: true
			})
		);
		expect(abandonedJob).toEqual(
			expect.objectContaining({
				status: 'disabled',
				manualRunAllowed: false
			})
		);
		expect(sendCriticalAdminAlertMock).not.toHaveBeenCalled();
	});
});
