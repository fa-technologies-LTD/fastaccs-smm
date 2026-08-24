import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	walletTransaction: {
		findUnique: vi.fn(),
		findMany: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
		create: vi.fn()
	},
	wallet: {
		findUnique: vi.fn(),
		update: vi.fn()
	}
}));

const prismaMock = vi.hoisted(() => ({
	order: { findUnique: vi.fn() },
	walletTransaction: { findUnique: vi.fn(), findMany: vi.fn() },
	$transaction: vi.fn()
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import {
	reconcileRegularRewardForOrder,
	reverseVestedRegularRewardForOrder
} from './affiliate-vesting';

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.order.findUnique.mockResolvedValue({ totalAmount: 22_500, refundedAmount: 7_500 });
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
	txMock.walletTransaction.update.mockResolvedValue({});
	txMock.walletTransaction.updateMany.mockResolvedValue({ count: 0 });
	txMock.walletTransaction.create.mockResolvedValue({});
	txMock.wallet.findUnique.mockResolvedValue({ balance: 900 });
	txMock.wallet.update.mockResolvedValue({});
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

	it('records only the amount actually recovered when the vested reward was already spent', async () => {
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
					amount: 100,
					balanceBefore: 100,
					balanceAfter: 0,
					metadata: expect.objectContaining({ unrecoveredAdjustmentAmount: 150 })
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
