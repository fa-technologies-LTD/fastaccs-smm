import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyPaymentMock = vi.hoisted(() => vi.fn());
const markPaymentPendingMock = vi.hoisted(() => vi.fn());
const recoverPaidOrderMock = vi.hoisted(() => vi.fn());
const settleFailedPaymentMock = vi.hoisted(() => vi.fn());
const settleSuccessfulPaymentMock = vi.hoisted(() => vi.fn());
const releaseExpiredOrderReservationsMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	order: {
		findMany: vi.fn()
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		MONNIFY_API_KEY: 'test-api-key',
		MONNIFY_SECRET_KEY: 'test-secret-key',
		MONNIFY_BASE_URL: 'https://sandbox.monnify.test'
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/payment', () => ({
	verifyPayment: verifyPaymentMock
}));

vi.mock('$lib/services/payment-settlement', () => ({
	markPaymentPending: markPaymentPendingMock,
	recoverPaidOrder: recoverPaidOrderMock,
	settleFailedPayment: settleFailedPaymentMock,
	settleSuccessfulPayment: settleSuccessfulPaymentMock
}));

vi.mock('$lib/services/order-reservations', () => ({
	releaseExpiredOrderReservations: releaseExpiredOrderReservationsMock
}));

vi.mock('$lib/services/admin-alerts', () => ({
	sendCriticalAdminAlert: vi.fn()
}));

import { reconcilePendingPaymentBacklog, reconcilePendingPayments } from './payment-reconciliation';

function pendingOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: 'order-1',
		orderNumber: 'ORD-1',
		status: 'pending_payment',
		paymentStatus: 'pending',
		paymentMethod: 'monnify',
		paymentReference: 'ORD-1-REF',
		paymentExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date(Date.now() - 60 * 60 * 1000),
		updatedAt: new Date(Date.now() - 30 * 60 * 1000),
		...overrides
	};
}

describe('payment reconciliation safety', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		releaseExpiredOrderReservationsMock.mockResolvedValue(0);
		markPaymentPendingMock.mockResolvedValue(undefined);
		recoverPaidOrderMock.mockResolvedValue({
			success: true,
			orderId: 'order-1',
			status: 'COMPLETED'
		});
		settleFailedPaymentMock.mockResolvedValue({
			success: false,
			orderId: 'order-1',
			status: 'FAILED'
		});
		settleSuccessfulPaymentMock.mockResolvedValue({
			success: true,
			orderId: 'order-1',
			status: 'COMPLETED'
		});
	});

	it('keeps an unresolved gateway payment pending without attempting fulfillment', async () => {
		prismaMock.order.findMany.mockResolvedValue([pendingOrder()]);
		verifyPaymentMock.mockResolvedValue({
			success: false,
			status: 'PENDING',
			paymentReference: 'ORD-1-REF',
			amount: 0,
			amountPaid: 0,
			currency: 'NGN'
		});

		const result = await reconcilePendingPayments({ staleMinutes: 0 });

		expect(result.keptPending).toBe(1);
		expect(markPaymentPendingMock).toHaveBeenCalledWith({
			orderId: 'order-1',
			gatewayStatus: 'PENDING',
			source: 'reconcile'
		});
		expect(settleSuccessfulPaymentMock).not.toHaveBeenCalled();
		expect(settleFailedPaymentMock).not.toHaveBeenCalled();
	});

	it('settles a verified successful payment through the shared settlement path', async () => {
		prismaMock.order.findMany.mockResolvedValue([pendingOrder()]);
		verifyPaymentMock.mockResolvedValue({
			success: true,
			status: 'PAID',
			paymentReference: 'ORD-1-REF',
			amount: 2500,
			amountPaid: 2500,
			currency: 'NGN',
			channel: 'CARD',
			paidAt: new Date()
		});

		const result = await reconcilePendingPayments({ staleMinutes: 0 });

		expect(result.completed).toBe(1);
		expect(settleSuccessfulPaymentMock).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: 'order-1',
				source: 'reconcile',
				amountPaid: 2500,
				currency: 'NGN'
			})
		);
		expect(settleFailedPaymentMock).not.toHaveBeenCalled();
	});

	it('does not reverify an already-confirmed paid order and only invokes recovery', async () => {
		prismaMock.order.findMany.mockResolvedValue([
			pendingOrder({
				status: 'paid',
				paymentStatus: 'paid'
			})
		]);

		const result = await reconcilePendingPayments({ staleMinutes: 0 });

		expect(result.completed).toBe(1);
		expect(recoverPaidOrderMock).toHaveBeenCalledWith('order-1', 'reconcile');
		expect(verifyPaymentMock).not.toHaveBeenCalled();
		expect(settleSuccessfulPaymentMock).not.toHaveBeenCalled();
	});

	it('routes a verified terminal failure through the shared failure path', async () => {
		prismaMock.order.findMany.mockResolvedValue([pendingOrder()]);
		verifyPaymentMock.mockResolvedValue({
			success: false,
			status: 'FAILED',
			paymentReference: 'ORD-1-REF',
			amount: 2500,
			amountPaid: 0,
			currency: 'NGN'
		});

		const result = await reconcilePendingPayments({ staleMinutes: 0 });

		expect(result.failed).toBe(1);
		expect(settleFailedPaymentMock).toHaveBeenCalledWith({
			orderId: 'order-1',
			failureKind: 'failed',
			source: 'reconcile'
		});
		expect(settleSuccessfulPaymentMock).not.toHaveBeenCalled();
	});

	it('processes a bounded backlog across multiple rounds without changing settlement rules', async () => {
		const paidOrders = Array.from({ length: 50 }, (_, index) =>
			pendingOrder({
				id: `order-${index}`,
				orderNumber: `ORD-${index}`,
				status: 'paid',
				paymentStatus: 'paid'
			})
		);
		prismaMock.order.findMany.mockResolvedValueOnce(paidOrders).mockResolvedValueOnce([]);

		const result = await reconcilePendingPaymentBacklog({
			limit: 50,
			maxRounds: 3,
			staleMinutes: 0
		});

		expect(result.rounds).toBe(2);
		expect(result.checked).toBe(50);
		expect(result.completed).toBe(50);
		expect(prismaMock.order.findMany).toHaveBeenCalledTimes(2);
		expect(verifyPaymentMock).not.toHaveBeenCalled();
		expect(settleSuccessfulPaymentMock).not.toHaveBeenCalled();
	});
});
