import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendWelcomeEmailIfNeededMock = vi.hoisted(() => vi.fn());
const sendMarketingEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	user: {
		findMany: vi.fn()
	},
	emailNotification: {
		findMany: vi.fn()
	},
	order: {
		findMany: vi.fn()
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/email', () => ({
	sendEmail: sendEmailMock,
	sendMarketingEmail: sendMarketingEmailMock,
	sendWelcomeEmailIfNeeded: sendWelcomeEmailIfNeededMock
}));

import { runOnboardingSequence, runWelcomeRecovery } from './lifecycle-email';

describe('onboarding lifecycle automation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.user.findMany.mockResolvedValue([]);
		prismaMock.emailNotification.findMany.mockResolvedValue([]);
		prismaMock.order.findMany.mockResolvedValue([]);
	});

	it('counts a duplicate welcome reservation as skipped instead of sent', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'buyer@example.com',
				fullName: 'Buyer One'
			}
		]);
		sendWelcomeEmailIfNeededMock.mockResolvedValue(false);

		const result = await runWelcomeRecovery();

		expect(result).toEqual({
			queued: 1,
			sent: 0,
			skipped: 1,
			failed: 0
		});
	});

	it('excludes users who received a welcome email within the last day', async () => {
		await runOnboardingSequence();

		expect(prismaMock.user.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					emailNotifications: {
						none: {
							notificationType: 'welcome',
							status: 'sent',
							sentAt: { gte: expect.any(Date) }
						}
					}
				})
			})
		);
	});
});
