import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrder: vi.fn(),
	updateOrder: vi.fn(),
	initializeTransaction: vi.fn(),
	extendOrderReservations: vi.fn(),
	releaseOrderReservations: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder,
			update: mocks.updateOrder
		}
	}
}));

vi.mock('$lib/services/monnify', () => ({
	initializeTransaction: mocks.initializeTransaction
}));

vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: vi.fn(async () => true)
}));

vi.mock('$lib/services/order-reservations', () => ({
	extendOrderReservations: mocks.extendOrderReservations,
	releaseOrderReservations: mocks.releaseOrderReservations
}));

vi.mock('$lib/helpers/payment-expiry.server', () => ({
	getPendingPaymentExpiresAt: vi.fn(() => new Date('2026-06-06T19:40:00.000Z')),
	getPaymentReservationExpiresAt: vi.fn(() => new Date('2026-06-06T19:45:00.000Z'))
}));

vi.mock('$lib/helpers/buyer-order-visibility', () => ({
	isOrderPaymentConfirmed: vi.fn(() => false)
}));

import { POST } from './+server';

const user = {
	id: 'user-123',
	userType: 'CUSTOMER',
	emailVerified: true,
	email: 'buyer@example.com',
	fullName: 'Buyer'
};

function pendingOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: 'order-123',
		userId: user.id,
		status: 'pending_payment',
		paymentStatus: 'pending',
		paymentReference: 'ORD_EXISTING',
		paymentCheckoutUrl: null,
		paymentExpiresAt: null,
		totalAmount: 2500,
		currency: 'NGN',
		...overrides
	};
}

async function callInitialize() {
	return POST({
		request: new Request('https://smm.fastaccs.com/api/payments/initialize', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-request-id': 'test-trace' },
			body: JSON.stringify({ orderId: 'order-123' })
		}),
		locals: { user },
		url: new URL('https://smm.fastaccs.com/api/payments/initialize')
	} as never);
}

describe('approved invariant: emergency checkout initialization control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('blocks a new hosted payment session without mutating the order', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		mocks.findOrder.mockResolvedValue(pendingOrder());

		const response = await callInitialize();
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body).toMatchObject({
			success: false,
			code: 'CHECKOUT_TEMPORARILY_DISABLED',
			traceId: 'test-trace'
		});
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.updateOrder).not.toHaveBeenCalled();
		expect(mocks.releaseOrderReservations).not.toHaveBeenCalled();
	});

	it('still resumes an active hosted session while new initialization is disabled', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		mocks.findOrder.mockResolvedValue(
			pendingOrder({
				paymentCheckoutUrl: 'https://checkout.monnify.test/existing',
				paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
			})
		);

		const response = await callInitialize();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			resumed: true,
			checkoutUrl: 'https://checkout.monnify.test/existing'
		});
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.updateOrder).not.toHaveBeenCalled();
	});

	it('preserves normal new-session initialization when the switch is off', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(pendingOrder());
		mocks.initializeTransaction.mockResolvedValue({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/new',
			transactionReference: 'MNFY|NEW'
		});
		mocks.updateOrder.mockResolvedValue(pendingOrder());

		const response = await callInitialize();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/new',
			traceId: 'test-trace'
		});
		expect(mocks.initializeTransaction).toHaveBeenCalledOnce();
		expect(mocks.updateOrder).toHaveBeenCalledOnce();
		expect(mocks.extendOrderReservations).toHaveBeenCalledOnce();
	});

	it.each([
		['zero amount', { totalAmount: 0 }, 'Payment amount is invalid.'],
		['unsupported currency', { currency: 'USD' }, 'This checkout currency is not supported.']
	])(
		'rejects %s before provider initialization or order mutation',
		async (_label, overrides, error) => {
			vi.stubEnv('CHECKOUT_DISABLED', 'false');
			mocks.findOrder.mockResolvedValue(pendingOrder(overrides));

			const response = await callInitialize();
			const body = await response.json();

			expect(response.status).toBe(409);
			expect(body).toMatchObject({
				success: false,
				traceId: 'test-trace'
			});
			expect(body.error).toContain(error);
			expect(mocks.initializeTransaction).not.toHaveBeenCalled();
			expect(mocks.updateOrder).not.toHaveBeenCalled();
			expect(mocks.extendOrderReservations).not.toHaveBeenCalled();
			expect(mocks.releaseOrderReservations).not.toHaveBeenCalled();
		}
	);
});
