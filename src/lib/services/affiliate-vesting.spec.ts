import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOT_HELD_FOR_IDENTITY_REVIEW } from './affiliate-review-hold';

const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: { findUnique: vi.fn(), findMany: vi.fn() },
	walletTransaction: {
		findUnique: vi.fn(),
		findMany: vi.fn(),
		count: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
		create: vi.fn()
	},
	wallet: {
		findUnique: vi.fn(),
		update: vi.fn()
	},
	notification: { create: vi.fn() },
	affiliateEvent: { create: vi.fn() }
}));

const prismaMock = vi.hoisted(() => ({
	user: { findMany: vi.fn() },
	affiliatePayoutDetails: { findFirst: vi.fn() },
	order: { findUnique: vi.fn(), findMany: vi.fn() },
	walletTransaction: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
	affiliateEvent: { create: vi.fn() },
	// No Super switchover set: today's terms apply.
	microcopy: { findUnique: vi.fn().mockResolvedValue(null) },
	$transaction: vi.fn()
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import {
	detectAffiliateIdentityRiskSignals,
	reconcileRegularRewardForOrder,
	reverseVestedRegularRewardForOrder,
	vestMaturedAffiliateRewards,
	voidUnvestedRewardsForOrder
} from './affiliate-vesting';

afterEach(() => vi.useRealTimers());

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.order.findUnique.mockResolvedValue({ totalAmount: 22_500, refundedAmount: 7_500 });
	prismaMock.order.findMany.mockResolvedValue([{ totalAmount: 5000, refundedAmount: 0 }]);
	txMock.order.findUnique.mockImplementation((args) => prismaMock.order.findUnique(args));
	txMock.order.findMany.mockImplementation((args) => prismaMock.order.findMany(args));
	prismaMock.user.findMany.mockResolvedValue([]);
	prismaMock.affiliatePayoutDetails.findFirst.mockResolvedValue(null);
	prismaMock.walletTransaction.findUnique.mockResolvedValue({
		id: 'reward-1',
		walletId: 'wallet-1',
		userId: 'affiliate-1'
	});
	prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
		callback(txMock)
	);
	txMock.$queryRaw.mockResolvedValue([]);
	txMock.walletTransaction.findMany.mockResolvedValue([]);
	txMock.walletTransaction.count.mockResolvedValue(2);
	txMock.walletTransaction.update.mockResolvedValue({});
	txMock.walletTransaction.updateMany.mockResolvedValue({ count: 0 });
	txMock.walletTransaction.create.mockResolvedValue({});
	txMock.wallet.findUnique.mockResolvedValue({ balance: 900 });
	txMock.wallet.update.mockResolvedValue({});
});

describe('affiliate identity risk signals', () => {
	it('holds a reward when affiliate and buyer use the same normalized phone number', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{ id: 'affiliate-1', phone: '+234 801 234 5678' },
			{ id: 'buyer-1', phone: '08012345678' }
		]);

		await expect(detectAffiliateIdentityRiskSignals('affiliate-1', 'buyer-1')).resolves.toContain(
			'shared_phone'
		);
	});

	it('holds a reward when affiliate and buyer submit the same payout bank account', async () => {
		prismaMock.user.findMany.mockResolvedValue([
			{ id: 'affiliate-1', phone: '+2348011111111' },
			{ id: 'buyer-1', phone: '+2348022222222' }
		]);
		prismaMock.affiliatePayoutDetails.findFirst
			.mockResolvedValueOnce({
				userId: 'affiliate-1',
				bankName: 'Test Bank',
				accountNumber: '0123456789',
				accountName: 'Person One',
				phone: '08011111111',
				feedback: null,
				encryptedPayload: null,
				encryptionKeyId: null,
				accountNumberLast4: '6789'
			})
			.mockResolvedValueOnce({
				userId: 'buyer-1',
				bankName: 'test bank',
				accountNumber: '0123456789',
				accountName: 'Person Two',
				phone: '08022222222',
				feedback: null,
				encryptedPayload: null,
				encryptionKeyId: null,
				accountNumberLast4: '6789'
			});

		await expect(detectAffiliateIdentityRiskSignals('affiliate-1', 'buyer-1')).resolves.toContain(
			'shared_bank_account'
		);
	});
});

describe('24-hour Super reward release', () => {
	const now = new Date('2026-10-21T12:00:00.000Z');
	function reward(overrides: Record<string, unknown> = {}) {
		return {
			id: 'super-reward',
			amount: 700,
			walletId: 'wallet-1',
			userId: 'affiliate-1',
			createdAt: new Date('2026-10-20T12:00:00.000Z'),
			reference: 'super:activation:affiliate-1:buyer-1',
			metadata: {
				kind: 'super_activation',
				referredUserId: 'buyer-1',
				activatedByOrderId: 'order-1',
				activationSpendThreshold: 3500,
				activationOrderThreshold: 3,
				vestsAt: '2026-11-03T12:00:00.000Z'
			},
			...overrides
		};
	}
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		prismaMock.order.findUnique.mockResolvedValue({
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'delivered',
			paidAt: new Date('2026-10-20T12:00:00.000Z'),
			createdAt: new Date('2026-10-20T11:59:00.000Z')
		});
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'pending', amount: 700 });
		txMock.wallet.findUnique.mockResolvedValue({ balance: 1800, isActive: true });
	});
	it('clears a legacy 14-day Super reward at exactly 24 hours, preserving the old deadline in history', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([reward()]);
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 1 });
		expect(txMock.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 2500 }
		});
		expect(txMock.walletTransaction.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'available',
					metadata: expect.objectContaining({
						originalVestsAt: '2026-11-03T12:00:00.000Z',
						vestsAt: '2026-10-21T12:00:00.000Z',
						vestingHours: 24,
						vestingPolicy: 'super-24h-v1'
					})
				})
			})
		);
	});
	it('does not clear at 23 hours 59 minutes 59 seconds', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			reward({ createdAt: new Date('2026-10-20T12:00:01.000Z') })
		]);
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('keeps an ordinary reward on its existing 14-day schedule', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			reward({
				reference: 'affiliate:credit:order:order-1',
				metadata: { orderId: 'order-1', vestsAt: '2026-11-03T12:00:00.000Z' }
			})
		]);
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('uses original payment time for a legacy Super commission, not its later creation time', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			reward({
				createdAt: new Date('2026-10-21T11:00:00.000Z'),
				reference: 'super:commission:order:order-1',
				metadata: {
					kind: 'super_order_commission',
					orderId: 'order-1',
					vestsAt: '2026-11-03T12:00:00.000Z'
				}
			})
		]);
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 1 });
	});
	it('holds a cost-missing commission even if it incorrectly has pending status', async () => {
		const r = reward();
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{ ...r, metadata: { ...r.metadata, holdReason: 'cost_missing' } }
		]);
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('rechecks a review hold added after selection while the wallet is locked', async () => {
		const r = reward();
		prismaMock.walletTransaction.findMany.mockResolvedValue([r]);
		txMock.walletTransaction.findUnique.mockResolvedValue({
			...r,
			status: 'pending',
			metadata: { ...r.metadata, suspectedSelfReferral: true }
		});
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('does not use a stale selection after an account transfer', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([reward()]);
		txMock.walletTransaction.findUnique.mockResolvedValue({
			status: 'pending',
			amount: 700,
			userId: 'different-user',
			walletId: 'different-wallet'
		});
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('checks refunds again under the wallet lock', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			reward({
				reference: 'affiliate:credit:order:order-1',
				metadata: { orderId: 'order-1', vestsAt: '2026-10-20T12:00:00.000Z' }
			})
		]);
		txMock.order.findUnique.mockResolvedValueOnce({
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded'
		});
		expect(await vestMaturedAffiliateRewards()).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});

	it('keeps an earned activation when other retained orders still qualify after its trigger refunded', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([reward()]);
		prismaMock.order.findUnique.mockResolvedValue({
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded'
		});
		prismaMock.order.findMany.mockResolvedValue([{ totalAmount: 5000, refundedAmount: 0 }]);
		expect((await vestMaturedAffiliateRewards()).vested).toBe(1);
	});
	it('does not credit an inactive wallet or an already-cleared reward', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([reward()]);
		txMock.wallet.findUnique.mockResolvedValue({ balance: 1800, isActive: false });
		expect((await vestMaturedAffiliateRewards()).vested).toBe(0);
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'available', amount: 700 });
		expect((await vestMaturedAffiliateRewards()).vested).toBe(0);
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});
	it('supports an exact internal recovery scope without changing the normal cron default', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([]);
		await vestMaturedAffiliateRewards(5, { userId: 'affiliate-1', rewardIds: ['super-reward'] });
		expect(prismaMock.walletTransaction.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					userId: 'affiliate-1',
					id: { in: ['super-reward'] },
					status: 'pending',
					type: 'affiliate_credit',
					AND: [NOT_HELD_FOR_IDENTITY_REVIEW]
				})
			})
		);
	});
});

describe('super monthly bonus vesting', () => {
	it('does not count identity-flagged activations toward a vesting tier', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: 'monthly-1',
				amount: 3_000,
				walletId: 'wallet-1',
				userId: 'affiliate-1',
				metadata: {
					kind: 'super_monthly_bonus',
					monthKey: '2026-08',
					tierCount: 10,
					vestsAt: '2026-08-01T00:00:00.000Z'
				}
			}
		]);
		prismaMock.walletTransaction.count.mockResolvedValue(10);
		txMock.walletTransaction.count.mockResolvedValue(10);
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'pending', amount: 3_000 });
		txMock.wallet.findUnique.mockResolvedValue({ balance: 0 });

		const result = await vestMaturedAffiliateRewards();

		expect(result.vested).toBe(1);
		expect(prismaMock.walletTransaction.count).toHaveBeenCalledWith({
			where: expect.objectContaining({
				status: { notIn: ['reversed', 'failed', 'cancelled'] },
				AND: [NOT_HELD_FOR_IDENTITY_REVIEW]
			})
		});
	});

	it('creates one useful bell update when the first earning clears', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: 'reward-1',
				amount: 500,
				walletId: 'wallet-1',
				userId: 'affiliate-1',
				metadata: { vestsAt: '2026-08-01T00:00:00.000Z' }
			}
		]);
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'pending', amount: 500 });
		txMock.walletTransaction.count.mockResolvedValue(1);
		txMock.wallet.findUnique.mockResolvedValue({ balance: 0 });

		await vestMaturedAffiliateRewards();

		expect(txMock.notification.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				userId: 'affiliate-1',
				type: 'affiliate_store_credit',
				title: 'Your first earning is ready'
			})
		});
	});
});

describe('refund reward boundaries', () => {
	it('does not blindly void a Super activation just because this order triggered it', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([]);

		await voidUnvestedRewardsForOrder('order-1');

		expect(prismaMock.walletTransaction.findMany).toHaveBeenCalledWith({
			where: {
				type: 'affiliate_credit',
				// Pending rewards plus Super commissions held for a missing cost; activations are
				// tagged with activatedByOrderId (not orderId), so they are never matched here.
				status: { in: ['pending', 'under_review'] },
				OR: [
					{ reference: 'affiliate:credit:order:order-1' },
					{ metadata: { path: ['orderId'], equals: 'order-1' } }
				]
			},
			select: { id: true, userId: true }
		});
	});
});

describe('affiliate reward reconciliation after partial refunds', () => {
	it('resizes an unvested reward before it ever becomes spendable', async () => {
		txMock.walletTransaction.findUnique.mockResolvedValue({
			amount: 750,
			status: 'pending',
			metadata: { buyerUserId: 'buyer-1' }
		});

		await reconcileRegularRewardForOrder('order-1');

		expect(txMock.walletTransaction.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'reward-1' },
				data: expect.objectContaining({
					amount: 500,
					status: 'pending',
					metadata: expect.objectContaining({
						originalAwardAmount: 750,
						orderRefundedAmount: 7_500
					})
				})
			})
		);
		expect(txMock.wallet.update).not.toHaveBeenCalled();
		expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
	});

	it('uses an append-only debit to reduce an already-vested reward', async () => {
		txMock.walletTransaction.findUnique.mockResolvedValue({
			amount: 750,
			status: 'available',
			metadata: { originalAwardAmount: 750, buyerUserId: 'buyer-1' }
		});

		await reconcileRegularRewardForOrder('order-1');

		expect(txMock.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 650 }
		});
		expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					type: 'affiliate_credit_adjustment',
					amount: 250,
					balanceBefore: 900,
					balanceAfter: 650,
					metadata: expect.objectContaining({
						orderId: 'order-1',
						buyerUserId: 'buyer-1',
						targetAwardAmount: 500
					})
				})
			})
		);
	});

	it('is idempotent when the required vested adjustment already exists', async () => {
		txMock.walletTransaction.findUnique.mockResolvedValue({
			amount: 750,
			status: 'available',
			metadata: { originalAwardAmount: 750 }
		});
		txMock.walletTransaction.findMany.mockResolvedValue([{ amount: 250 }]);

		await reconcileRegularRewardForOrder('order-1');

		expect(txMock.wallet.findUnique).not.toHaveBeenCalled();
		expect(txMock.wallet.update).not.toHaveBeenCalled();
		expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
	});

	it('records the full adjustment even when only part can be recovered immediately', async () => {
		txMock.walletTransaction.findUnique.mockResolvedValue({
			amount: 750,
			status: 'available',
			metadata: { originalAwardAmount: 750 }
		});
		txMock.wallet.findUnique.mockResolvedValue({ balance: 100 });

		await reconcileRegularRewardForOrder('order-1');

		expect(txMock.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 0 }
		});
		expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					amount: 250,
					balanceBefore: 100,
					balanceAfter: 0,
					metadata: expect.objectContaining({
						recoveredAdjustmentAmount: 100,
						unrecoveredAdjustmentAmount: 150
					})
				})
			})
		);
	});

	it('removes only the remaining vested reward on a later full refund', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{ id: 'reward-1', amount: 750, walletId: 'wallet-1', userId: 'affiliate-1' }
		]);
		txMock.walletTransaction.findUnique.mockResolvedValue({ amount: 750, status: 'available' });
		txMock.walletTransaction.findMany.mockResolvedValue([{ id: 'adjustment-1', amount: 250 }]);
		txMock.wallet.findUnique.mockResolvedValue({ balance: 650 });

		const result = await reverseVestedRegularRewardForOrder('order-1');

		expect(result).toEqual({ reversed: 1 });
		expect(txMock.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 150 }
		});
		expect(txMock.walletTransaction.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ['adjustment-1'] } },
			data: { status: 'reversed' }
		});
	});
});

describe('clearing job and identity-review holds', () => {
	const due = '2026-09-01T00:00:00.000Z';

	it('looks only for rewards not held for review, and clears an unflagged due reward', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: 'reward-9',
				amount: 700,
				walletId: 'wallet-1',
				userId: 'affiliate-1',
				metadata: { vestsAt: due, orderId: 'order-9' }
			}
		]);
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'pending', amount: 700 });
		txMock.wallet.findUnique.mockResolvedValue({ balance: 2_800 });

		const result = await vestMaturedAffiliateRewards();

		const where = prismaMock.walletTransaction.findMany.mock.calls[0][0].where;
		expect(where).toMatchObject({ type: 'affiliate_credit', status: 'pending' });
		expect(where.AND).toEqual([NOT_HELD_FOR_IDENTITY_REVIEW]);
		expect(where).not.toHaveProperty('NOT');
		expect(result.vested).toBe(1);
		expect(txMock.wallet.update).toHaveBeenCalledWith({
			where: { id: 'wallet-1' },
			data: { balance: 3_500 }
		});
		expect(txMock.walletTransaction.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'reward-9' },
				data: expect.objectContaining({ status: 'available' })
			})
		);
	});

	it('keeps a flagged reward held even if one reaches the job', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: 'reward-flagged',
				amount: 700,
				walletId: 'wallet-1',
				userId: 'affiliate-1',
				metadata: { vestsAt: due, suspectedSelfReferral: true }
			}
		]);

		const result = await vestMaturedAffiliateRewards();

		expect(result).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.walletTransaction.update).not.toHaveBeenCalled();
		expect(txMock.wallet.update).not.toHaveBeenCalled();
	});

	it('leaves a reward that is not yet due as pending', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: 'reward-future',
				amount: 700,
				walletId: 'wallet-1',
				userId: 'affiliate-1',
				metadata: { vestsAt: '2999-01-01T00:00:00.000Z' }
			}
		]);

		const result = await vestMaturedAffiliateRewards();

		expect(result).toMatchObject({ vested: 0, skipped: 1 });
		expect(txMock.walletTransaction.update).not.toHaveBeenCalled();
	});
});
