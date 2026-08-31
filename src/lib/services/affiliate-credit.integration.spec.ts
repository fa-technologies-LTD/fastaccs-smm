import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrder: vi.fn(),
	findOrders: vi.fn(),
	countOrders: vi.fn(),
	findWalletTransaction: vi.fn(),
	findFirstWalletTransaction: vi.fn(),
	countWalletTransactions: vi.fn(),
	findAffiliateProgram: vi.fn(),
	findSettings: vi.fn(),
	findSetting: vi.fn(),
	findUsers: vi.fn(),
	findUser: vi.fn(),
	findPayoutDetails: vi.fn(),
	createAffiliateEvent: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	wallet: { upsert: vi.fn(), findUnique: vi.fn() },
	walletTransaction: {
		findMany: vi.fn(),
		findUnique: vi.fn(),
		count: vi.fn(),
		create: vi.fn()
	},
	affiliateEvent: { create: vi.fn() },
	notification: { create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder,
			findMany: mocks.findOrders,
			count: mocks.countOrders
		},
		walletTransaction: {
			findUnique: mocks.findWalletTransaction,
			findFirst: mocks.findFirstWalletTransaction,
			count: mocks.countWalletTransactions
		},
		affiliateProgram: {
			findFirst: mocks.findAffiliateProgram
		},
		user: {
			findMany: mocks.findUsers,
			findUnique: mocks.findUser
		},
		affiliatePayoutDetails: {
			findFirst: mocks.findPayoutDetails
		},
		affiliateEvent: { create: mocks.createAffiliateEvent },
		microcopy: {
			findMany: mocks.findSettings,
			findFirst: mocks.findSetting
		},
		$transaction: mocks.transaction
	}
}));

vi.mock('$lib/services/email', () => ({
	sendEmail: vi.fn()
}));

vi.mock('$lib/services/admin-settings', () => ({
	getOperationalAlertRecipients: vi.fn()
}));

import {
	calculateAffiliatePayoutEligibility,
	calculateAffiliateLedgerSummary,
	calculateAffiliateRewardCostSummary,
	getAffiliateDiscountForOrder,
	recordAffiliateStoreCreditForOrder,
	resolveAffiliatePolicyForOrder,
	resolveAffiliateRelationshipPolicy
} from './affiliate';

describe('affiliate business reporting', () => {
	it('separates regular and Super reward costs and removes clawback adjustments', () => {
		expect(
			calculateAffiliateRewardCostSummary([
				{
					type: 'affiliate_credit',
					status: 'available',
					amount: 500,
					reference: 'affiliate:credit:order:one'
				},
				{
					type: 'affiliate_credit',
					status: 'pending',
					amount: 700,
					reference: 'super:activation:a:b'
				},
				{
					type: 'affiliate_credit',
					status: 'available',
					amount: 3_000,
					reference: 'super:monthly_bonus:a:2026-08:10'
				},
				{
					type: 'affiliate_credit_adjustment',
					status: 'available',
					amount: 200,
					reference: 'affiliate:adjustment:order:one:5000'
				},
				{
					type: 'affiliate_credit_adjustment',
					status: 'available',
					amount: 1_000,
					reference: 'super:monthly_bonus_adjustment:a:2026-08:x',
					metadata: { kind: 'super_monthly_bonus_adjustment' }
				},
				{
					type: 'affiliate_credit',
					status: 'reversed',
					amount: 9_999,
					reference: 'super:activation:reversed'
				}
			])
		).toEqual({ regularRewardCost: 300, superRewardCost: 2_700, totalRewardCost: 3_000 });
	});
});

const LIVE_CONFIG = {
	unlockThreshold: 20_000,
	discountStage1Percent: 5,
	discountStage1Cap: 1_000,
	buyerDiscountOrderLimit: 2,
	maxRewardedOrdersPerBuyer: 2,
	storeCreditMax: 1_000,
	storeCreditFallbackPercent: 5,
	excludedTierKeywords: [],
	payoutMinimum: 5_000,
	payoutMinAccountAgeDays: 15,
	dashboardPopupsEnabled: true,
	superAffiliateEnabled: false,
	superActivationSpendThreshold: 100_000,
	superActivationOrderThreshold: 99,
	superActivationReward: 100,
	superTier1Count: 50,
	superTier1Amount: 1_000,
	superTier2Count: 100,
	superTier2Amount: 2_000,
	superTier3Count: 200,
	superTier3Amount: 3_000
};

const FROZEN_SUPER_POLICY = {
	version: 1,
	programId: 'program-1',
	programType: 'super',
	superTerms: {
		enabled: true,
		activationSpendThreshold: 3_500,
		activationOrderThreshold: 3,
		activationReward: 700,
		monthlyTiers: [
			{ count: 10, amount: 3_000 },
			{ count: 20, amount: 8_000 },
			{ count: 30, amount: 15_000 }
		]
	},
	snapshottedAt: '2026-08-01T00:00:00.000Z'
};

function buildOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: 'order-1',
		orderNumber: 'ORD-1',
		userId: 'buyer-1',
		affiliateCode: 'AFF001',
		affiliateUserId: 'affiliate-1',
		orderType: 'account',
		subtotal: 10_000,
		discountAmount: 500,
		storeCreditApplied: 0,
		totalAmount: 10_000,
		status: 'pending_payment',
		paymentStatus: 'pending',
		deliveryStatus: 'not_started',
		refundedAmount: 0,
		analyticsMetadata: {},
		orderItems: [],
		...overrides
	};
}

describe('frozen affiliate relationship policy', () => {
	it('copies the original Super agreement onto later orders despite live setting changes', () => {
		const orderPolicy = resolveAffiliatePolicyForOrder({
			storedPolicySnapshot: FROZEN_SUPER_POLICY,
			programId: 'program-1',
			liveIsSuperAffiliate: false,
			liveConfig: LIVE_CONFIG,
			orderSnapshottedAt: '2026-08-25T00:00:00.000Z'
		});

		expect(orderPolicy).toMatchObject({
			version: 3,
			programType: 'super',
			source: 'referral_contract',
			superTerms: {
				enabled: true,
				activationSpendThreshold: 3_500,
				activationOrderThreshold: 3,
				activationReward: 700
			}
		});
	});

	it('keeps an older regular relationship regular after the affiliate is promoted', () => {
		const policy = resolveAffiliateRelationshipPolicy({
			referralPolicySnapshot: {
				version: 1,
				programId: 'program-1',
				programType: 'regular',
				snapshottedAt: '2026-07-01T00:00:00.000Z'
			},
			programId: 'program-1',
			liveIsSuperAffiliate: true,
			liveConfig: { ...LIVE_CONFIG, superAffiliateEnabled: true }
		});

		expect(policy).toMatchObject({
			programType: 'regular',
			termsFrozen: true,
			source: 'referral_contract'
		});
		expect(policy.superTerms).toBeNull();
	});

	it('uses the earliest trustworthy order contract only for a legacy unsnapshotted referral', () => {
		const policy = resolveAffiliateRelationshipPolicy({
			referralPolicySnapshot: {},
			orderPolicySnapshots: [FROZEN_SUPER_POLICY],
			programId: 'program-1',
			liveIsSuperAffiliate: false,
			liveConfig: LIVE_CONFIG
		});

		expect(policy).toMatchObject({
			programType: 'super',
			termsFrozen: true,
			source: 'order_contract',
			superTerms: { activationReward: 700 }
		});
	});
});

describe('canonical affiliate ledger summary', () => {
	it('uses one calculation for available, reserved, spent, paid, and adjusted earnings', () => {
		expect(
			calculateAffiliateLedgerSummary([
				{ type: 'affiliate_credit', status: 'available', amount: 10_000 },
				{ type: 'affiliate_credit', status: 'pending', amount: 700 },
				{ type: 'affiliate_payout', status: 'requested', amount: 5_000 },
				{ type: 'affiliate_payout', status: 'paid', amount: 2_000 },
				{ type: 'store_credit_redemption_earned', status: 'available', amount: 1_000 },
				{ type: 'affiliate_credit_adjustment', status: 'available', amount: 500 }
			])
		).toEqual({
			availableStoreCredit: 1_500,
			pendingStoreCredit: 700,
			underReviewStoreCredit: 0,
			requestedStoreCredit: 5_000,
			paidStoreCredit: 2_000,
			reversedStoreCredit: 0,
			totalStoreCreditEarned: 10_200
		});
	});
});

describe('affiliate payout eligibility', () => {
	it('shows only the live request while cash is already reserved', () => {
		expect(
			calculateAffiliatePayoutEligibility({
				availableStoreCredit: 0,
				requestedStoreCredit: 5_000,
				payoutMinimum: 5_000,
				accountAgeDays: 30,
				payoutMinAccountAgeDays: 15,
				bankDetailsStatus: 'approved'
			})
		).toEqual({ eligible: false, hasOpenRequest: true, blockers: ['payout_pending'] });
	});

	it('reports every real blocker and becomes eligible only when all are cleared', () => {
		expect(
			calculateAffiliatePayoutEligibility({
				availableStoreCredit: 4_000,
				requestedStoreCredit: 0,
				payoutMinimum: 5_000,
				accountAgeDays: 10,
				payoutMinAccountAgeDays: 15,
				bankDetailsStatus: 'pending'
			})
		).toEqual({
			eligible: false,
			hasOpenRequest: false,
			blockers: ['minimum_balance', 'account_age', 'bank_details_pending']
		});

		expect(
			calculateAffiliatePayoutEligibility({
				availableStoreCredit: 5_000,
				requestedStoreCredit: 0,
				payoutMinimum: 5_000,
				accountAgeDays: 15,
				payoutMinAccountAgeDays: 15,
				bankDetailsStatus: 'approved'
			})
		).toEqual({ eligible: true, hasOpenRequest: false, blockers: [] });
	});
});

describe('affiliate credit settlement boundaries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: the referrer is a regular (non-super) affiliate.
		mocks.findAffiliateProgram.mockResolvedValue(null);
		mocks.findFirstWalletTransaction.mockResolvedValue({
			metadata: {
				monthlyTiers: [
					{ count: 10, amount: 3_000 },
					{ count: 20, amount: 8_000 },
					{ count: 30, amount: 15_000 }
				]
			}
		});
		tx.$queryRaw.mockResolvedValue([]);
		tx.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
		tx.wallet.findUnique.mockResolvedValue({ balance: 0 });
		tx.walletTransaction.findMany.mockResolvedValue([]);
		tx.walletTransaction.findUnique.mockResolvedValue(null);
		tx.walletTransaction.count.mockResolvedValue(0);
		tx.walletTransaction.create.mockResolvedValue({});
		tx.affiliateEvent.create.mockResolvedValue({});
		tx.notification.create.mockResolvedValue({});
		mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
			callback(tx)
		);
		mocks.findSettings.mockResolvedValue([]);
		mocks.findSetting.mockResolvedValue(null);
		mocks.findOrders.mockResolvedValue([]);
		mocks.findUsers.mockResolvedValue([]);
		mocks.findUser.mockResolvedValue({ fullName: 'Buyer One' });
		mocks.findPayoutDetails.mockResolvedValue(null);
		mocks.createAffiliateEvent.mockResolvedValue({});
	});

	it('counts only prior retained orders that actually used the affiliate benefit', async () => {
		mocks.countOrders.mockResolvedValue(1);

		const result = await getAffiliateDiscountForOrder({
			buyerUserId: 'buyer-1',
			affiliateUserId: 'affiliate-1',
			subtotalAmount: 20_000,
			orderItems: [{ quantity: 1, totalPrice: 20_000, productName: 'Instagram Account' }]
		});

		expect(result).toMatchObject({ discountAmount: 1_000, orderIndex: 2, maxRewardedOrders: 2 });
		expect(mocks.countOrders).toHaveBeenCalledWith({
			where: {
				AND: [
					expect.any(Object),
					{
						userId: 'buyer-1',
						affiliateUserId: 'affiliate-1',
						orderType: 'account',
						discountAmount: { gt: 0 }
					}
				]
			}
		});
	});

	it('does not award Store Credit for an unpaid pending order', async () => {
		mocks.findOrder.mockResolvedValue(buildOrder());

		const result = await recordAffiliateStoreCreditForOrder('order-1');

		expect(result).toEqual({ success: true, storeCreditAwarded: 0 });
		expect(mocks.findWalletTransaction).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('does not award Store Credit for self-referral', async () => {
		mocks.findOrder.mockResolvedValue(
			buildOrder({
				status: 'completed',
				paymentStatus: 'paid',
				affiliateUserId: 'buyer-1'
			})
		);

		const result = await recordAffiliateStoreCreditForOrder('order-1');

		expect(result).toEqual({ success: true, storeCreditAwarded: 0 });
		expect(mocks.findWalletTransaction).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('treats an existing order credit reference as idempotently settled', async () => {
		mocks.findOrder.mockResolvedValue(
			buildOrder({
				status: 'completed',
				paymentStatus: 'paid'
			})
		);
		mocks.findWalletTransaction.mockResolvedValue({ id: 'existing-credit' });

		const result = await recordAffiliateStoreCreditForOrder('order-1');

		expect(result).toEqual({ success: true, storeCreditAwarded: 0 });
		expect(mocks.findWalletTransaction).toHaveBeenCalledWith({
			where: { reference: 'affiliate:credit:order:order-1' },
			select: { id: true }
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('rechecks a super monthly tier when an activation already exists from an earlier retry', async () => {
		mocks.findOrder.mockResolvedValue(buildOrder({ status: 'completed', paymentStatus: 'paid' }));
		mocks.findAffiliateProgram.mockResolvedValue({
			id: 'program-1',
			isSuperAffiliate: true
		});
		mocks.findWalletTransaction.mockResolvedValue({
			id: 'existing-activation',
			createdAt: new Date('2026-08-15T00:00:00.000Z')
		});
		// No tier is crossed in this fixture; the important invariant is that the
		// retry still performs the monthly count instead of returning too early.
		mocks.countWalletTransactions.mockResolvedValue(9);

		const result = await recordAffiliateStoreCreditForOrder('order-1');

		expect(result).toEqual({ success: true, storeCreditAwarded: 0 });
		expect(mocks.countWalletTransactions).toHaveBeenCalledOnce();
	});

	it("uses the month's first activation snapshot instead of a later live tier change", async () => {
		mocks.findOrder.mockResolvedValue(buildOrder({ status: 'completed', paymentStatus: 'paid' }));
		mocks.findAffiliateProgram.mockResolvedValue({ id: 'program-1', isSuperAffiliate: true });
		mocks.findWalletTransaction.mockResolvedValue({
			id: 'existing-activation',
			createdAt: new Date('2026-08-15T00:00:00.000Z')
		});
		mocks.findFirstWalletTransaction.mockResolvedValue({
			metadata: {
				monthlyTiers: [
					{ count: 10, amount: 1_234 },
					{ count: 20, amount: 5_678 },
					{ count: 30, amount: 9_999 }
				]
			}
		});
		mocks.countWalletTransactions.mockResolvedValue(10);

		const result = await recordAffiliateStoreCreditForOrder('order-1');

		expect(result).toEqual({ success: true, storeCreditAwarded: 0 });
		expect(tx.walletTransaction.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				amount: 1_234,
				metadata: expect.objectContaining({ tierCount: 10, tierTotalAmount: 1_234 })
			})
		});
	});

	it("keeps a Super referral's first paid-order terms after live settings change", async () => {
		mocks.findOrder.mockResolvedValue(
			buildOrder({
				status: 'completed',
				paymentStatus: 'paid',
				analyticsMetadata: {
					affiliatePolicy: { version: 2, programId: 'program-1', programType: 'super' }
				}
			})
		);
		mocks.findAffiliateProgram.mockResolvedValue({ id: 'program-1', isSuperAffiliate: true });
		mocks.findSettings.mockResolvedValue([
			{ key: 'config.affiliate.super.enabled', value: 'false' },
			{ key: 'config.affiliate.super.activation_spend_threshold', value: '100000' },
			{ key: 'config.affiliate.super.activation_order_threshold', value: '99' },
			{ key: 'config.affiliate.super.activation_reward', value: '100' }
		]);
		mocks.findOrders
			.mockResolvedValueOnce([
				{
					analyticsMetadata: {
						affiliatePolicy: {
							version: 2,
							programType: 'super',
							superTerms: {
								enabled: true,
								activationSpendThreshold: 3_500,
								activationOrderThreshold: 3,
								activationReward: 700,
								monthlyTiers: [
									{ count: 10, amount: 3_000 },
									{ count: 20, amount: 8_000 },
									{ count: 30, amount: 15_000 }
								]
							}
						}
					}
				}
			])
			.mockResolvedValueOnce([{ totalAmount: 3_500, refundedAmount: 0 }]);
		mocks.findWalletTransaction.mockResolvedValue(null);
		mocks.countWalletTransactions.mockResolvedValue(1);
		tx.walletTransaction.create.mockResolvedValueOnce({
			createdAt: new Date('2026-08-25T12:00:00.000Z')
		});

		await expect(recordAffiliateStoreCreditForOrder('order-1')).resolves.toEqual({
			success: true,
			storeCreditAwarded: 700
		});
		expect(tx.walletTransaction.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				amount: 700,
				metadata: expect.objectContaining({
					activationSpendThreshold: 3_500,
					activationOrderThreshold: 3,
					activationReward: 700
				})
			}),
			select: { createdAt: true }
		});
	});
});
