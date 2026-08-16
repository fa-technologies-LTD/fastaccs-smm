import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Money-critical invariants for the Numbers fulfillment/refund path. These lock the CURRENT
 * hub-man behaviour so the upcoming provider-abstraction rewire can't change it — above all
 * the "a delivered code is NEVER refunded" guard that the past leak violated.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
	orderItem: { findUnique: vi.fn(), findFirst: vi.fn() },
	order: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
	$transaction: vi.fn()
}));
const getSmsMock = vi.hoisted(() => vi.fn());
const cancelRentMock = vi.hoisted(() => vi.fn());
const creditStoreCreditMock = vi.hoisted(() => vi.fn());
const getPhoneTierConfigMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./hubman', () => ({
	getSms: getSmsMock,
	cancelRent: cancelRentMock,
	rentActivationNumber: vi.fn(),
	getBalanceCents: vi.fn(),
	isHubmanConfigured: () => true,
	HubmanError: class HubmanError extends Error {}
}));
vi.mock('./store-credit', () => ({
	creditStoreCredit: creditStoreCreditMock,
	SC_CREDIT_REFUND: 'SC_CREDIT_REFUND'
}));
vi.mock('./phone-telemetry', () => ({
	recordPhoneAttempt: () => Promise.resolve(null),
	recordAttemptOtpReceived: () => Promise.resolve(),
	recordAttemptOtpTimeout: () => Promise.resolve(),
	recordAttemptRejection: () => Promise.resolve(),
	classifyRentFailure: () => ({ outcome: 'error', category: 'provider_error' })
}));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	computeMaxPriceCentsForSale: vi.fn(),
	computeProcurementCeilingCents: () => 100000
}));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: getPhoneTierConfigMock }));

import {
	cancelAndRefundRental,
	refundPhoneOrderToStoreCredit,
	initPhoneOrder,
	pollPhoneRentalSms
} from './phone-fulfillment';

beforeEach(() => {
	vi.clearAllMocks();
	// Default: markRentalReceived's claim + order lookup succeed; refund tx credits once.
	prismaMock.phoneRental.updateMany.mockResolvedValue({ count: 1 });
	prismaMock.orderItem.findUnique.mockResolvedValue({ orderId: 'order-1' });
	prismaMock.order.update.mockResolvedValue({});
	prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
	prismaMock.order.findUnique.mockResolvedValue({ userId: 'user-1' });
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 1200,
		category: { metadata: {} },
		order: {
			userId: 'user-1',
			orderNumber: 'ORD-1',
			status: 'paid',
			paymentStatus: 'paid',
			deliveryStatus: 'processing'
		}
	});
	getPhoneTierConfigMock.mockReturnValue({
		serviceId: 1,
		countryId: 2,
		serviceName: 'WA',
		countryName: 'US'
	});
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({
			$queryRaw: vi.fn().mockResolvedValue([]),
			phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			order: { update: vi.fn().mockResolvedValue({}) }
		})
	);
});

const awaitingRental = (over = {}) => ({
	orderItemId: 'item-1',
	status: 'awaiting_sms',
	provider: 'hubman',
	providerRef: 'hub-uuid-1',
	hubOrderUuid: 'hub-uuid-1',
	generation: 1,
	operationToken: null,
	operationLeaseExpiresAt: null,
	rentedAt: new Date(Date.now() - 5 * 60_000),
	createdAt: new Date(Date.now() - 6 * 60_000),
	...over
});

describe('cancelAndRefundRental — delivered code is NEVER refunded (the leak guard)', () => {
	it('marks received and does NOT refund when a code is present', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(awaitingRental());
		getSmsMock.mockResolvedValue({ otp: '123456', message: 'code 123456', sender_name: 'WA' });

		const outcome = await cancelAndRefundRental('item-1', 'test');

		expect(outcome).toBe('received');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
		expect(cancelRentMock).not.toHaveBeenCalled();
	});

	it('also honours a code that is only in the message body (no parsed otp)', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(awaitingRental());
		getSmsMock.mockResolvedValue({ otp: '', message: 'Your code is 771234', sender_name: '' });

		const outcome = await cancelAndRefundRental('item-1', 'test');

		expect(outcome).toBe('received');
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
	});
});

describe('cancelAndRefundRental — no code', () => {
	it('cancels the rental and refunds to store credit', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(awaitingRental());
		getSmsMock.mockResolvedValue(null);
		cancelRentMock.mockResolvedValue(true);

		const outcome = await cancelAndRefundRental('item-1', 'No code — refunded');

		expect(cancelRentMock).toHaveBeenCalledWith('hub-uuid-1');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
		expect(outcome).toBe('refunded');
	});
});

describe('cancelAndRefundRental — terminal states are no-ops', () => {
	it('returns received without touching hub-man when already received', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(awaitingRental({ status: 'received' }));
		expect(await cancelAndRefundRental('item-1', 'x')).toBe('received');
		expect(getSmsMock).not.toHaveBeenCalled();
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
	});
});

describe('refundPhoneOrderToStoreCredit — idempotent (credit issued at most once)', () => {
	it('does NOT credit again when the claim finds nothing to refund', async () => {
		prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb({
				$queryRaw: vi.fn().mockResolvedValue([]),
				phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
				order: { update: vi.fn() }
			})
		);
		const ok = await refundPhoneOrderToStoreCredit('order-1', 'dup', 'test');
		expect(ok).toBe(false);
		expect(creditStoreCreditMock).not.toHaveBeenCalled();
	});

	it('credits once and marks the order refunded when the claim succeeds', async () => {
		const ok = await refundPhoneOrderToStoreCredit('order-1', 'refund', 'test');
		expect(ok).toBe(true);
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
		expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
			maxWait: 10_000,
			timeout: 20_000
		});
	});

	it('atomically fences a rent generation while issuing the customer credit', async () => {
		const rentalClaim = vi.fn().mockResolvedValue({ count: 1 });
		prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb({
				$queryRaw: vi.fn().mockResolvedValue([]),
				phoneRental: { updateMany: rentalClaim },
				order: { update: vi.fn().mockResolvedValue({}) }
			})
		);

		const ok = await refundPhoneOrderToStoreCredit('order-1', 'refund', 'test', {
			generation: 4,
			status: 'renting',
			rentLeaseToken: 'generation-4-owner',
			failureReason: 'no viable supplier'
		});

		expect(ok).toBe(true);
		expect(rentalClaim).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					generation: 4,
					status: 'renting',
					rentLeaseToken: 'generation-4-owner'
				}),
				data: expect.objectContaining({ status: 'refunded', failureReason: 'no viable supplier' })
			})
		);
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});
});

describe('pollPhoneRentalSms — financially incomplete failure recovery', () => {
	it('retries the wallet refund for a failed rental that has no refundedAt timestamp', async () => {
		prismaMock.phoneRental.findUnique.mockResolvedValue(
			awaitingRental({
				status: 'failed',
				refundedAt: null,
				failureReason: 'legacy DB interruption'
			})
		);

		const result = await pollPhoneRentalSms('item-1');

		expect(result.status).toBe('refunded');
		expect(creditStoreCreditMock).toHaveBeenCalledOnce();
	});
});

describe('initPhoneOrder — terminal order fence', () => {
	it('never recreates or marks paid an order already refunded', async () => {
		prismaMock.orderItem.findFirst.mockResolvedValue({
			id: 'item-1',
			totalPrice: 1200,
			category: { metadata: {} },
			order: {
				userId: 'user-1',
				orderNumber: 'ORD-1',
				status: 'refunded',
				paymentStatus: 'refunded',
				deliveryStatus: 'refunded'
			}
		});

		const result = await initPhoneOrder('order-1');

		expect(result.ok).toBe(false);
		expect(prismaMock.phoneRental.upsert).not.toHaveBeenCalled();
		expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
	});
});
