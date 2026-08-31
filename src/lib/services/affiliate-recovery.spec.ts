import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrders: vi.fn(),
	findWalletTransaction: vi.fn(),
	findWalletTransactions: vi.fn(),
	findAffiliatePrograms: vi.fn(),
	aggregateOrders: vi.fn(),
	updateAffiliateProgram: vi.fn(),
	reconcileRegular: vi.fn(),
	voidUnvested: vi.fn(),
	reverseVested: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findMany: mocks.findOrders,
			aggregate: mocks.aggregateOrders
		},
		walletTransaction: {
			findUnique: mocks.findWalletTransaction,
			findMany: mocks.findWalletTransactions
		},
		affiliateProgram: {
			findMany: mocks.findAffiliatePrograms,
			update: mocks.updateAffiliateProgram
		}
	}
}));

vi.mock('$lib/services/affiliate-vesting', () => ({
	getRewardVestingDays: vi.fn().mockResolvedValue(14),
	computeVestsAt: vi.fn(() => new Date('2026-09-08T00:00:00.000Z')),
	detectAffiliateIdentityRiskSignals: vi.fn().mockResolvedValue([]),
	reconcileRegularRewardForOrder: mocks.reconcileRegular,
	voidUnvestedRewardsForOrder: mocks.voidUnvested,
	reverseVestedRegularRewardForOrder: mocks.reverseVested
}));

vi.mock('$lib/services/email', () => ({ sendEmail: vi.fn() }));
vi.mock('$lib/services/admin-settings', () => ({ getOperationalAlertRecipients: vi.fn() }));

import { recoverAffiliateRewardIntegrity } from './affiliate';

const FULL_REFUND = {
	id: 'order-1',
	userId: 'buyer-1',
	affiliateUserId: 'affiliate-1',
	status: 'refunded',
	paymentStatus: 'refunded',
	deliveryStatus: 'refunded'
};

describe('affiliate integrity recovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findWalletTransaction.mockResolvedValue(null);
		mocks.findWalletTransactions.mockResolvedValue([]);
		mocks.findAffiliatePrograms.mockResolvedValue([{ id: 'program-1', affiliateCode: 'AFF001' }]);
		mocks.aggregateOrders.mockResolvedValue({
			_sum: { totalAmount: 0, refundedAmount: 0 }
		});
		mocks.updateAffiliateProgram.mockResolvedValue({});
		mocks.reconcileRegular.mockResolvedValue(undefined);
		mocks.voidUnvested.mockResolvedValue({ voided: 0 });
		mocks.reverseVested.mockResolvedValue({ reversed: 0 });
	});

	it('starts refund repair from recently changed orders and fully reverses terminal rewards', async () => {
		mocks.findOrders.mockResolvedValueOnce([]).mockResolvedValueOnce([FULL_REFUND]);

		const result = await recoverAffiliateRewardIntegrity(50);

		expect(mocks.voidUnvested).toHaveBeenCalledWith('order-1');
		expect(mocks.reverseVested).toHaveBeenCalledWith('order-1');
		expect(mocks.reconcileRegular).not.toHaveBeenCalled();
		expect(mocks.findAffiliatePrograms).toHaveBeenCalledWith({
			where: { userId: 'affiliate-1' },
			select: { id: true, affiliateCode: true }
		});
		expect(result).toMatchObject({
			reconciledRegularRewards: 1,
			reconciledSuperActivations: 1,
			reconciledAffiliateSales: 1,
			failed: 0
		});
	});

	it('recomputes rather than fully reverses a partial-refund reward', async () => {
		mocks.findOrders.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				...FULL_REFUND,
				status: 'completed',
				paymentStatus: 'paid',
				deliveryStatus: 'delivered'
			}
		]);

		await recoverAffiliateRewardIntegrity(50);

		expect(mocks.reconcileRegular).toHaveBeenCalledWith('order-1');
		expect(mocks.voidUnvested).not.toHaveBeenCalled();
		expect(mocks.reverseVested).not.toHaveBeenCalled();
	});
});
