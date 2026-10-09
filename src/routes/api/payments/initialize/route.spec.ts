import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrder: vi.fn(),
	updateOrder: vi.fn(),
	updateManyOrders: vi.fn(),
	initializeTransaction: vi.fn(),
	verifyTransaction: vi.fn(),
	settleSuccessfulPayment: vi.fn(),
	settleFailedPayment: vi.fn(),
	isOrderPaymentConfirmed: vi.fn(),
	extendOrderReservations: vi.fn(),
	releaseOrderReservations: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder,
			update: mocks.updateOrder,
			updateMany: mocks.updateManyOrders
		}
	}
}));

vi.mock('$lib/services/monnify', () => ({
	initializeTransaction: mocks.initializeTransaction,
	verifyTransaction: mocks.verifyTransaction
}));
vi.mock('$lib/services/payment-settlement', () => ({
	settleSuccessfulPayment: mocks.settleSuccessfulPayment,
	settleFailedPayment: mocks.settleFailedPayment,
	computeExpectedGatewayAmount: (total: number, credit: number) => Math.max(0, total - credit)
}));

vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: vi.fn(async () => true)
}));

vi.mock('$lib/services/order-reservations', () => ({
	extendOrderReservations: mocks.extendOrderReservations,
	releaseOrderReservations: mocks.releaseOrderReservations
}));

vi.mock('$lib/helpers/payment-expiry.server', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getPendingPaymentExpiresAt: vi.fn(() => new Date(Date.now() + 15 * 60_000)),
	getPaymentReservationExpiresAt: vi.fn((expiry: Date) => new Date(expiry.getTime() + 5 * 60_000))
}));

vi.mock('$lib/helpers/buyer-order-visibility', () => ({
	isOrderPaymentConfirmed: mocks.isOrderPaymentConfirmed
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
		paymentReference: null,
		paymentCheckoutUrl: null,
		paymentExpiresAt: null,
		totalAmount: 2500,
		storeCreditApplied: 0,
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
		mocks.updateManyOrders.mockResolvedValue({ count: 1 });
		mocks.isOrderPaymentConfirmed.mockReturnValue(false);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('retains an ambiguous gateway session instead of releasing stock or credit', async () => {
		mocks.findOrder.mockResolvedValue(pendingOrder());
		mocks.initializeTransaction.mockResolvedValue({
			success: false,
			errorCode: 'provider_initialization_failed',
			failureCertainty: 'unknown'
		});
		const response = await callInitialize();
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			success: false,
			pending: true,
			orderId: 'order-123'
		});
		expect(mocks.updateManyOrders).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					paymentStatus: 'processing',
					cancellationReason: 'initialization_unknown'
				})
			})
		);
		expect(mocks.releaseOrderReservations).not.toHaveBeenCalled();
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

	it('rejects a Boosting order below ₦500 before contacting the payment provider', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(pendingOrder({ orderType: 'boosting', totalAmount: 350 }));
		const response = await callInitialize();
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: 'BOOSTING_MINIMUM_CHECKOUT',
			error: 'Add ₦150 more in Boosting to check out.'
		});
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.updateManyOrders).not.toHaveBeenCalled();
	});

	it('still resumes an active hosted session while new initialization is disabled', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		mocks.findOrder.mockResolvedValue(
			pendingOrder({
				paymentReference: 'ORD_EXISTING',
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
		expect(mocks.updateManyOrders).toHaveBeenCalledTimes(2);
		expect(mocks.extendOrderReservations).toHaveBeenCalledOnce();
	});

	it('does not create a second payable session when an existing reference is unresolved', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(
			pendingOrder({ paymentReference: 'ORD_ALREADY_CLAIMED', paymentCheckoutUrl: null })
		);

		const response = await callInitialize();
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body).toMatchObject({ success: false, pending: true, orderId: 'order-123' });
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.updateManyOrders).not.toHaveBeenCalled();
	});

	it('allows only one concurrent request to claim gateway initialization', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(pendingOrder());
		mocks.updateManyOrders.mockResolvedValueOnce({ count: 0 });

		const response = await callInitialize();

		expect(response.status).toBe(202);
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});
	it.each(['under_review', 'refunded', 'failed'])(
		'cannot initialize an inconsistent pending order with payment state %s',
		async (paymentStatus) => {
			mocks.findOrder.mockResolvedValue(pendingOrder({ paymentStatus }));
			expect((await callInitialize()).status).toBe(409);
			expect(mocks.initializeTransaction).not.toHaveBeenCalled();
			expect(mocks.updateManyOrders).not.toHaveBeenCalled();
		}
	);
	it('does not expose a checkout link after cancellation wins the initialization finalization', async () => {
		mocks.findOrder
			.mockResolvedValueOnce(pendingOrder())
			.mockResolvedValueOnce(pendingOrder({ status: 'cancelled' }));
		mocks.initializeTransaction.mockResolvedValue({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/new'
		});
		mocks.updateManyOrders.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
		const response = await callInitialize();
		expect(response.status).toBe(202);
		expect(await response.json()).not.toHaveProperty('checkoutUrl');
		expect(mocks.extendOrderReservations).not.toHaveBeenCalled();
	});
	it('returns already-paid instead of a payable link when a webhook wins initialization', async () => {
		mocks.findOrder.mockResolvedValue(pendingOrder());
		mocks.initializeTransaction.mockResolvedValue({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/new'
		});
		mocks.updateManyOrders.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
		mocks.isOrderPaymentConfirmed.mockReturnValueOnce(false).mockReturnValueOnce(true);
		const response = await callInitialize();
		expect(await response.json()).toMatchObject({ success: true, alreadyPaid: true });
		expect(mocks.extendOrderReservations).not.toHaveBeenCalled();
	});
	it('does not claim a late verified payment is cleared when settlement puts it under review', async () => {
		mocks.findOrder.mockResolvedValue(
			pendingOrder({
				paymentReference: 'ORD_EXISTING',
				paymentExpiresAt: new Date(Date.now() - 1000)
			})
		);
		mocks.verifyTransaction.mockResolvedValue({
			success: true,
			paymentStatus: 'PAID',
			amountPaid: 2500,
			currency: 'NGN'
		});
		mocks.settleSuccessfulPayment.mockResolvedValue({
			success: true,
			status: 'PENDING',
			warning: 'Your payment is being reviewed before delivery.'
		});
		const response = await callInitialize();
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({ success: false, pending: true });
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});
	it('does not resume an expired link when cancellation wins its conditional extension', async () => {
		mocks.findOrder.mockResolvedValue(
			pendingOrder({
				paymentReference: 'ORD_EXISTING',
				paymentCheckoutUrl: 'https://checkout.monnify.test/existing',
				paymentExpiresAt: new Date(Date.now() - 1000)
			})
		);
		mocks.verifyTransaction.mockResolvedValue({ success: false, paymentStatus: 'PENDING' });
		mocks.updateManyOrders.mockResolvedValueOnce({ count: 0 });
		const response = await callInitialize();
		expect(response.status).toBe(202);
		expect(await response.json()).not.toHaveProperty('checkoutUrl');
		expect(mocks.extendOrderReservations).not.toHaveBeenCalled();
	});

	it('charges only the cash remainder of a store-credit split payment', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(
			pendingOrder({ paymentReference: null, totalAmount: 2500, storeCreditApplied: 1000 })
		);
		mocks.initializeTransaction.mockResolvedValue({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/split',
			transactionReference: 'MNFY|SPLIT'
		});
		mocks.updateOrder.mockResolvedValue(pendingOrder());

		const response = await callInitialize();

		expect(response.status).toBe(200);
		expect(mocks.initializeTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 1500,
				currency: 'NGN',
				redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123'
			})
		);
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
