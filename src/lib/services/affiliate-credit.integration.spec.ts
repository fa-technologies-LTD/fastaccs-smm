import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrder: vi.fn(),
	findWalletTransaction: vi.fn(),
	transaction: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder
		},
		walletTransaction: {
			findUnique: mocks.findWalletTransaction
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

import { recordAffiliateStoreCreditForOrder } from './affiliate';

function buildOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: 'order-1',
		orderNumber: 'ORD-1',
		userId: 'buyer-1',
		affiliateCode: 'AFF001',
		affiliateUserId: 'affiliate-1',
		totalAmount: 10_000,
		status: 'pending_payment',
		paymentStatus: 'pending',
		orderItems: [],
		...overrides
	};
}

describe('affiliate credit settlement boundaries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
