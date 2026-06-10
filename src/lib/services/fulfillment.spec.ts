import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: {
		findUnique: vi.fn(),
		update: vi.fn()
	},
	account: {
		findMany: vi.fn()
	}
}));
const prismaMock = vi.hoisted(() => ({
	$transaction: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('./affiliate', () => ({
	maybeSendAffiliateUnlockInvite: vi.fn(),
	recordAffiliateStoreCreditForOrder: vi.fn()
}));

vi.mock('./email', () => ({
	sendOrderConfirmationEmailIfNeeded: vi.fn()
}));

vi.mock('./admin-metrics', () => ({
	invalidateAdminStatsCache: vi.fn()
}));

vi.mock('./admin-alerts', () => ({
	sendLowStockAdminAlertIfNeeded: vi.fn()
}));

vi.mock('$lib/services/exact-preview', () => ({
	allocateReservedExactPreviewAccountsForItem: vi.fn()
}));

import { allocateAccountsForOrder } from './fulfillment';

describe('credential allocation safety', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$transaction.mockImplementation(
			async (callback: (transaction: typeof txMock) => unknown) => callback(txMock)
		);
		txMock.$queryRaw.mockResolvedValue([{ id: 'order-1' }]);
	});

	it('refuses to allocate any account before payment and order state are confirmed', async () => {
		txMock.order.findUnique.mockResolvedValue({
			id: 'order-1',
			status: 'pending_payment',
			paymentStatus: 'pending',
			orderItems: [{ id: 'item-1', quantity: 1 }]
		});

		const result = await allocateAccountsForOrder('order-1');

		expect(result).toEqual({
			success: false,
			error: 'Payment must be confirmed before account allocation'
		});
		expect(txMock.account.findMany).not.toHaveBeenCalled();
		expect(txMock.order.update).not.toHaveBeenCalled();
		expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
	});

	it('refuses to process an already completed order again', async () => {
		txMock.order.findUnique.mockResolvedValue({
			id: 'order-1',
			status: 'completed',
			paymentStatus: 'paid',
			orderItems: [{ id: 'item-1', quantity: 1 }]
		});

		const result = await allocateAccountsForOrder('order-1');

		expect(result).toEqual({
			success: false,
			error: 'Order already processed'
		});
		expect(txMock.account.findMany).not.toHaveBeenCalled();
		expect(txMock.order.update).not.toHaveBeenCalled();
	});
});
