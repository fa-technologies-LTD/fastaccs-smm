import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAffiliateConfigMock = vi.hoisted(() => vi.fn());
const maybeSendAffiliateUnlockInviteMock = vi.hoisted(() => vi.fn());
const recoverFirstStoreCreditEmailsMock = vi.hoisted(() => vi.fn());
const recoverAffiliateBankReadyEmailsMock = vi.hoisted(() => vi.fn());
const sendAffiliateUnlockEmailIfNeededMock = vi.hoisted(() => vi.fn());
const recoverAffiliatePayoutStatusEmailsMock = vi.hoisted(() => vi.fn());
const sendMarketingEmailMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	user: {
		findMany: vi.fn()
	},
	affiliateProgram: {
		findMany: vi.fn()
	},
	emailNotification: {
		findFirst: vi.fn()
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/email', () => ({ sendMarketingEmail: sendMarketingEmailMock }));

vi.mock('$lib/services/affiliate', () => ({
	PROGRESS_MILESTONES: [95, 80, 50],
	getAffiliateConfig: getAffiliateConfigMock,
	maybeSendAffiliateUnlockInvite: maybeSendAffiliateUnlockInviteMock
}));

vi.mock('$lib/services/affiliate-notification-email', () => ({
	recoverFirstStoreCreditEmails: recoverFirstStoreCreditEmailsMock,
	recoverAffiliateBankReadyEmails: recoverAffiliateBankReadyEmailsMock,
	sendAffiliateUnlockEmailIfNeeded: sendAffiliateUnlockEmailIfNeededMock
}));

vi.mock('$lib/services/affiliate-payout-email', () => ({
	recoverAffiliatePayoutStatusEmails: recoverAffiliatePayoutStatusEmailsMock
}));

import {
	runAffiliateLifecycleEmailRecovery,
	sendAffiliateAnnouncementEmails
} from './affiliate-lifecycle-email';

describe('affiliate lifecycle email recovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAffiliateConfigMock.mockResolvedValue({ unlockThreshold: 50_000 });
		recoverFirstStoreCreditEmailsMock.mockResolvedValue({
			processed: 0,
			sent: 0,
			failed: 0
		});
		recoverAffiliateBankReadyEmailsMock.mockResolvedValue({
			processed: 0,
			sent: 0,
			failed: 0
		});
		recoverAffiliatePayoutStatusEmailsMock.mockResolvedValue({
			processed: 0,
			sent: 0,
			failed: 0
		});
		sendAffiliateUnlockEmailIfNeededMock.mockResolvedValue(false);
		maybeSendAffiliateUnlockInviteMock.mockResolvedValue(undefined);
		prismaMock.emailNotification.findFirst.mockResolvedValue(null);
		prismaMock.affiliateProgram.findMany.mockResolvedValue([]);
		sendMarketingEmailMock.mockResolvedValue({ success: true });
	});

	it('sends the one-time affiliate announcement through marketing consent controls', async () => {
		getAffiliateConfigMock.mockResolvedValue({ payoutMinimum: 5_000 });
		prismaMock.affiliateProgram.findMany.mockResolvedValue([
			{
				affiliateCode: 'AFF001',
				createdAt: new Date('2026-08-01T00:00:00.000Z'),
				user: {
					id: 'user-1',
					email: 'affiliate@example.com',
					fullName: 'Affiliate One',
					isActive: true
				}
			}
		]);

		await expect(sendAffiliateAnnouncementEmails()).resolves.toEqual({
			sent: 1,
			skipped: 0,
			failed: 0
		});
		expect(sendMarketingEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				campaignKey: 'affiliate_program_2026_announcement',
				notificationType: 'affiliate_unlock',
				subject: 'Your Fast Accounts affiliate code is ready',
				body: expect.stringContaining('payouts are processed on Saturdays')
			})
		);
	});

	it('sends the unlock invite (not a stale "spend more" email) to a purchased non-affiliate', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'buyer@example.com',
				fullName: 'Buyer One',
				isAffiliateEnabled: false,
				affiliatePrograms: [],
				affiliatePayoutDetails: null,
				orders: [{ totalAmount: 10_000 }, { totalAmount: 15_000 }]
			}
		]);

		await runAffiliateLifecycleEmailRecovery();

		// First purchase already unlocks access, so we invite them to claim their code
		// rather than telling them to "spend more".
		expect(maybeSendAffiliateUnlockInviteMock).toHaveBeenCalledWith('user-1');
		expect(sendAffiliateUnlockEmailIfNeededMock).not.toHaveBeenCalled();
	});

	it('heals a missed affiliate activation after the first successful purchase', async () => {
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

		expect(maybeSendAffiliateUnlockInviteMock).toHaveBeenCalledWith('user-1');
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
		expect(sendAffiliateUnlockEmailIfNeededMock).not.toHaveBeenCalled();
	});

	it('recovers the one-time unlock email for an already-active affiliate', async () => {
		sendAffiliateUnlockEmailIfNeededMock.mockResolvedValue(true);
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'affiliate@example.com',
				fullName: 'Affiliate One',
				isAffiliateEnabled: true,
				affiliatePrograms: [
					{
						id: 'program-1',
						affiliateCode: 'AFF001',
						totalReferrals: 0,
						status: 'active',
						createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
					}
				],
				orders: []
			}
		]);

		const result = await runAffiliateLifecycleEmailRecovery();

		expect(sendAffiliateUnlockEmailIfNeededMock).toHaveBeenCalledWith('user-1');
		expect(result.sent).toBe(1);
	});

	it('does not send generic marketing nudges to an active affiliate', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'affiliate@example.com',
				fullName: 'Affiliate One',
				isAffiliateEnabled: true,
				affiliatePrograms: [
					{
						id: 'program-1',
						affiliateCode: 'AFF001',
						totalReferrals: 3,
						status: 'active',
						createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
					}
				],
				affiliatePayoutDetails: { id: 'bank-1' },
				orders: []
			}
		]);

		await runAffiliateLifecycleEmailRecovery();

		expect(sendAffiliateUnlockEmailIfNeededMock).toHaveBeenCalledWith('user-1');
	});

	it('leaves the one-time bank-ready email to the ledger recovery path', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{
				id: 'user-1',
				email: 'affiliate@example.com',
				fullName: 'Affiliate One',
				isAffiliateEnabled: true,
				affiliatePrograms: [
					{
						id: 'program-1',
						affiliateCode: 'AFF001',
						totalReferrals: 3,
						status: 'active',
						createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
					}
				],
				affiliatePayoutDetails: null,
				orders: []
			}
		]);

		await runAffiliateLifecycleEmailRecovery();

		expect(recoverAffiliateBankReadyEmailsMock).toHaveBeenCalled();
		expect(sendAffiliateUnlockEmailIfNeededMock).toHaveBeenCalledWith('user-1');
	});
});
