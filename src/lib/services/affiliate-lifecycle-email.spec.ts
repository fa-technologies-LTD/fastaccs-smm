import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMarketingEmailMock = vi.hoisted(() => vi.fn());
const getAffiliateConfigMock = vi.hoisted(() => vi.fn());
const maybeSendAffiliateUnlockInviteMock = vi.hoisted(() => vi.fn());
const recoverFirstStoreCreditEmailsMock = vi.hoisted(() => vi.fn());
const recoverAffiliatePayoutStatusEmailsMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	user: {
		findMany: vi.fn()
	},
	emailNotification: {
		findFirst: vi.fn()
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
		prismaMock.emailNotification.findFirst.mockResolvedValue(null);
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
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
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

	it('nudges an already-active affiliate with zero referrals to share their code', async () => {
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

		expect(sendMarketingEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notificationType: 'affiliate_activation_nudge',
				referenceId: 'affiliate_activation_nudge:user-1'
			})
		);
		expect(result.sent).toBe(1);
	});

	it('does not nudge an earning affiliate who already has bank details', async () => {
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

		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});

	it('nudges an earning affiliate with no bank details to add them', async () => {
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

		const result = await runAffiliateLifecycleEmailRecovery();

		expect(sendMarketingEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notificationType: 'affiliate_bank_details_nudge',
				referenceId: 'affiliate_bank_details_nudge:user-1'
			})
		);
		expect(result.sent).toBe(1);
	});
});
