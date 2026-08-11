import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Money-critical invariants for the Numbers fulfillment/refund path. These lock the CURRENT
 * hub-man behaviour so the upcoming provider-abstraction rewire can't change it — above all
 * the "a delivered code is NEVER refunded" guard that the past leak violated.
 */

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
	orderItem: { findUnique: vi.fn(), findFirst: vi.fn() },
	order: { update: vi.fn() },
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
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	computeMaxPriceCentsForSale: vi.fn(),
	computeProcurementCeilingCents: () => 100000
}));
vi.mock('$lib/helpers/phone-tier-config', () => ({ getPhoneTierConfig: getPhoneTierConfigMock }));

import { cancelAndRefundRental, refundPhoneOrderToStoreCredit } from './phone-fulfillment';

beforeEach(() => {
	vi.clearAllMocks();
	// Default: markRentalReceived's claim + order lookup succeed; refund tx credits once.
	prismaMock.phoneRental.updateMany.mockResolvedValue({ count: 1 });
	prismaMock.orderItem.findUnique.mockResolvedValue({ orderId: 'order-1' });
	prismaMock.order.update.mockResolvedValue({});
	prismaMock.orderItem.findFirst.mockResolvedValue({
		id: 'item-1',
		totalPrice: 1200,
		category: { metadata: {} },
		order: { userId: 'user-1', orderNumber: 'ORD-1' }
	});
	getPhoneTierConfigMock.mockReturnValue({ serviceId: 1, countryId: 2, serviceName: 'WA', countryName: 'US' });
	prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
		cb({
			phoneRental: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
			order: { update: vi.fn().mockResolvedValue({}) }
		})
	);
});

const awaitingRental = (over = {}) => ({
	orderItemId: 'item-1',
	status: 'awaiting_sms',
	hubOrderUuid: 'hub-uuid-1',
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
	});
});
