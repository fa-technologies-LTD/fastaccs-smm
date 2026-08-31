import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
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
	order: { findUnique: vi.fn() },
	walletTransaction: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
	affiliateEvent: { create: vi.fn() },
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

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.order.findUnique.mockResolvedValue({ totalAmount: 22_500, refundedAmount: 7_500 });
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
		txMock.walletTransaction.findUnique.mockResolvedValue({ status: 'pending', amount: 3_000 });
		txMock.wallet.findUnique.mockResolvedValue({ balance: 0 });

		const result = await vestMaturedAffiliateRewards();

		expect(result.vested).toBe(1);
		expect(prismaMock.walletTransaction.count).toHaveBeenCalledWith({
			where: expect.objectContaining({
				status: { notIn: ['reversed', 'failed', 'cancelled'] },
				NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } }
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
				status: 'pending',
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
