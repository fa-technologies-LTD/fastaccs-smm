import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	order: { findUnique: vi.fn(), updateMany: vi.fn() },
	$transaction: vi.fn()
}));
const releaseReservationsMock = vi.hoisted(() => vi.fn());
const reverseRedemptionMock = vi.hoisted(() => vi.fn());
const restoreRedemptionMock = vi.hoisted(() => vi.fn());
const confirmPhoneMock = vi.hoisted(() => vi.fn());
const initPhoneMock = vi.hoisted(() => vi.fn());
const isPhoneOrderMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('$lib/services/order-reservations', () => ({
	releaseOrderReservations: releaseReservationsMock
}));
vi.mock('$lib/services/store-credit', () => ({
	reverseStoreCreditRedemption: reverseRedemptionMock,
	restoreStoreCreditRedemptionForLatePayment: restoreRedemptionMock
}));
vi.mock('$lib/services/phone-fulfillment', () => ({
	confirmPhonePaymentAndInitializeRental: confirmPhoneMock,
	initPhoneOrder: initPhoneMock,
	isPhoneOrder: isPhoneOrderMock
}));
vi.mock('$lib/services/admin-alerts', () => ({ sendCriticalAdminAlert: alertMock }));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: vi.fn() }));
vi.mock('$lib/services/order-audit', () => ({ logOrderStatusTransition: vi.fn() }));

import { settleFailedPayment, settleSuccessfulPayment } from './payment-settlement';

const pendingSplitOrder = {
	id: '11111111-1111-4111-8111-111111111111',
	orderNumber: 'ORD-SPLIT',
	userId: '22222222-2222-4222-8222-222222222222',
	orderType: 'phone',
	status: 'pending_payment',
	paymentStatus: 'pending',
	deliveryStatus: 'pending',
	totalAmount: 4800,
	storeCreditApplied: 3800,
	currency: 'NGN',
	paymentReference: 'ORD_SPLIT',
	paymentChannel: null,
	paidAt: null
};

describe('payment settlement integrity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
		releaseReservationsMock.mockResolvedValue(undefined);
		reverseRedemptionMock.mockResolvedValue(undefined);
		alertMock.mockResolvedValue(undefined);
	});

	it('commits the failed state and store-credit restoration in the same order-locked transaction', async () => {
		const tx = {
			$queryRaw: vi.fn().mockResolvedValue([]),
			order: {
				findUnique: vi.fn().mockResolvedValue(pendingSplitOrder),
				update: vi.fn().mockResolvedValue({})
			}
		};
		prismaMock.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
			callback(tx)
		);

		const result = await settleFailedPayment({
			orderId: pendingSplitOrder.id,
			failureKind: 'failed',
			source: 'webhook'
		});

		expect(result.status).toBe('FAILED');
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.order.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'failed' }) })
		);
		expect(reverseRedemptionMock).toHaveBeenCalledWith(tx, {
			userId: pendingSplitOrder.userId,
			orderId: pendingSplitOrder.id
		});
		expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
			maxWait: 10_000,
			timeout: 20_000
		});
	});

	it('atomically releases the checkout key when a split-credit checkout is superseded', async () => {
		const tx = {
			$queryRaw: vi.fn().mockResolvedValue([]),
			order: {
				findUnique: vi.fn().mockResolvedValue({
					...pendingSplitOrder,
					checkoutKey: 'checkout-key'
				}),
				update: vi.fn().mockResolvedValue({})
			}
		};
		prismaMock.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
			callback(tx)
		);

		await settleFailedPayment({
			orderId: pendingSplitOrder.id,
			failureKind: 'cancelled',
			source: 'verify',
			clearCheckoutKey: true,
			cancellationReason: 'superseded_retry'
		});

		expect(tx.order.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'cancelled',
					paymentStatus: 'cancelled',
					checkoutKey: null,
					cancellationReason: 'superseded_retry'
				})
			})
		);
		expect(reverseRedemptionMock).toHaveBeenCalledOnce();
	});

	it('never overwrites an already-refunded order when a failure callback arrives late', async () => {
		const refunded = {
			...pendingSplitOrder,
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded'
		};
		const tx = {
			$queryRaw: vi.fn().mockResolvedValue([]),
			order: { findUnique: vi.fn().mockResolvedValue(refunded), update: vi.fn() }
		};
		prismaMock.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) =>
			callback(tx)
		);

		const result = await settleFailedPayment({
			orderId: refunded.id,
			failureKind: 'failed',
			source: 'webhook'
		});

		expect(result.status).toBe('CANCELLED');
		expect(tx.order.update).not.toHaveBeenCalled();
		expect(reverseRedemptionMock).not.toHaveBeenCalled();
	});

	it('holds a verified late split payment when restored credit has already been spent', async () => {
		prismaMock.order.findUnique.mockResolvedValue(pendingSplitOrder);
		isPhoneOrderMock.mockResolvedValue(true);
		confirmPhoneMock.mockRejectedValue(new Error('STORE_CREDIT_LATE_PAYMENT_INSUFFICIENT'));

		const result = await settleSuccessfulPayment({
			orderId: pendingSplitOrder.id,
			source: 'webhook',
			paymentReference: 'ORD_SPLIT',
			amountPaid: 1000,
			currency: 'NGN'
		});

		expect(result).toEqual(
			expect.objectContaining({ success: true, status: 'PENDING', orderId: pendingSplitOrder.id })
		);
		expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'payment_review',
					paymentStatus: 'under_review'
				})
			})
		);
		expect(alertMock).toHaveBeenCalledOnce();
		const reviewUpdate = prismaMock.order.updateMany.mock.calls[0]?.[0];
		expect(reviewUpdate?.data).not.toHaveProperty('status', 'paid');
	});

	it('holds a verified payment that arrives after cancellation instead of resurrecting delivery', async () => {
		prismaMock.order.findUnique.mockResolvedValue({
			...pendingSplitOrder,
			orderType: 'account',
			status: 'cancelled',
			paymentStatus: 'cancelled',
			cancellationReason: 'superseded_retry'
		});

		const result = await settleSuccessfulPayment({
			orderId: pendingSplitOrder.id,
			source: 'webhook',
			paymentReference: 'ORD_SPLIT',
			amountPaid: 1000,
			currency: 'NGN'
		});

		expect(result).toEqual(
			expect.objectContaining({ success: true, status: 'PENDING', orderId: pendingSplitOrder.id })
		);
		expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'payment_review',
					paymentStatus: 'under_review',
					cancellationReason: 'late_verified_payment_review'
				})
			})
		);
		expect(confirmPhoneMock).not.toHaveBeenCalled();
		expect(restoreRedemptionMock).not.toHaveBeenCalled();
		expect(alertMock).toHaveBeenCalledOnce();
	});

	it('defensively holds a conflicting payment reference even if a caller missed binding validation', async () => {
		prismaMock.order.findUnique.mockResolvedValue({
			...pendingSplitOrder,
			orderType: 'account',
			paymentReference: 'ORD_EXPECTED'
		});

		const result = await settleSuccessfulPayment({
			orderId: pendingSplitOrder.id,
			source: 'verify',
			paymentReference: 'ORD_OTHER',
			amountPaid: 1000,
			currency: 'NGN'
		});

		expect(result.status).toBe('PENDING');
		expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'payment_review',
					paymentStatus: 'under_review',
					cancellationReason: 'payment_reference_conflict_review'
				})
			})
		);
		expect(confirmPhoneMock).not.toHaveBeenCalled();
		expect(restoreRedemptionMock).not.toHaveBeenCalled();
	});

	it('never resurrects a refunded phone order on a late successful callback', async () => {
		prismaMock.order.findUnique.mockResolvedValue({
			...pendingSplitOrder,
			status: 'paid',
			paymentStatus: 'paid',
			deliveryStatus: 'refunded'
		});

		const result = await settleSuccessfulPayment({
			orderId: pendingSplitOrder.id,
			source: 'webhook',
			paymentReference: 'ORD_SPLIT',
			amountPaid: 1000,
			currency: 'NGN'
		});

		expect(result.status).toBe('CANCELLED');
		expect(initPhoneMock).not.toHaveBeenCalled();
		expect(confirmPhoneMock).not.toHaveBeenCalled();
	});
});
