import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMarketingEmailMock = vi.hoisted(() => vi.fn());
const getAffiliateConfigMock = vi.hoisted(() => vi.fn());
const maybeSendAffiliateUnlockInviteMock = vi.hoisted(() => vi.fn());
const recoverFirstStoreCreditEmailsMock = vi.hoisted(() => vi.fn());
const recoverAffiliatePayoutStatusEmailsMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	user: {
		findMany: vi.fn()
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/email', () => ({
	sendMarketingEmail: sendMarketingEmailMock
}));

vi.mock('$lib/services/affiliate', () => ({
	PROGRESS_MILESTONES: [95, 80, 50],
	getAffiliateConfig: getAffiliateConfigMock,
	maybeSendAffiliateUnlockInvite: maybeSendAffiliateUnlockInviteMock
}));

vi.mock('$lib/services/affiliate-notification-email', () => ({
	recoverFirstStoreCreditEmails: recoverFirstStoreCreditEmailsMock
}));

vi.mock('$lib/services/affiliate-payout-email', () => ({
	recoverAffiliatePayoutStatusEmails: recoverAffiliatePayoutStatusEmailsMock
}));

import { runAffiliateLifecycleEmailRecovery } from './affiliate-lifecycle-email';

describe('affiliate lifecycle email recovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAffiliateConfigMock.mockResolvedValue({ unlockThreshold: 50_000 });
		recoverFirstStoreCreditEmailsMock.mockResolvedValue({
			processed: 0,
			sent: 0,
			failed: 0
		});
		recoverAffiliatePayoutStatusEmailsMock.mockResolvedValue({
			processed: 0,
			sent: 0,
			failed: 0
		});
		sendMarketingEmailMock.mockResolvedValue({ success: true });
		maybeSendAffiliateUnlockInviteMock.mockResolvedValue(undefined);
	});

	it('introduces the program on the second successful purchase and records a progress milestone', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'buyer@example.com',
				fullName: 'Buyer One',
				isAffiliateEnabled: false,
				affiliatePrograms: [],
				orders: [{ totalAmount: 10_000 }, { totalAmount: 15_000 }]
			}
		]);

		const result = await runAffiliateLifecycleEmailRecovery();

		expect(sendMarketingEmailMock).toHaveBeenCalledTimes(2);
		expect(sendMarketingEmailMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				notificationType: 'affiliate_introduction',
				campaignKey: 'affiliate_introduction:user-1'
			})
		);
		expect(sendMarketingEmailMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				notificationType: 'affiliate_progress',
				campaignKey: 'affiliate_progress:50:user-1'
			})
		);
		expect(result.sent).toBe(2);
	});

	it('does not introduce the program before the second successful purchase', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'buyer@example.com',
				fullName: 'Buyer One',
				isAffiliateEnabled: false,
				affiliatePrograms: [],
				orders: [{ totalAmount: 10_000 }]
			}
		]);

		await runAffiliateLifecycleEmailRecovery();

		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});

	it('recovers the unlock email instead of sending marketing after the threshold is reached', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'buyer@example.com',
				fullName: 'Buyer One',
				isAffiliateEnabled: false,
				affiliatePrograms: [],
				orders: [{ totalAmount: 30_000 }, { totalAmount: 25_000 }]
			}
		]);

		await runAffiliateLifecycleEmailRecovery();

		expect(maybeSendAffiliateUnlockInviteMock).toHaveBeenCalledWith('user-1');
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});
});
