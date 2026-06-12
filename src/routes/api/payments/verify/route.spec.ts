import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyPayment: vi.fn(),
	findOrderById: vi.fn(),
	findOrderByReference: vi.fn(),
	markPaymentPending: vi.fn(),
	recoverPaidOrder: vi.fn(),
	settleFailedPayment: vi.fn(),
	settleSuccessfulPayment: vi.fn()
}));

vi.mock('$lib/services/payment', () => ({
	verifyPayment: mocks.verifyPayment
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrderById,
			findFirst: mocks.findOrderByReference
		}
	}
}));

vi.mock('$lib/services/payment-settlement', () => ({
	markPaymentPending: mocks.markPaymentPending,
	recoverPaidOrder: mocks.recoverPaidOrder,
	settleFailedPayment: mocks.settleFailedPayment,
	settleSuccessfulPayment: mocks.settleSuccessfulPayment
}));

vi.mock('$lib/services/admin-alerts', () => ({
	sendCriticalAdminAlert: vi.fn(async () => undefined)
}));

import { POST } from './+server';

const orderId = '00000000-0000-4000-8000-000000000123';
const user = { id: 'user-123' };

function pendingOrder(paymentReference = 'ORD_STORED') {
	return {
		id: orderId,
		userId: user.id,
		status: 'pending_payment',
		paymentStatus: 'pending',
		paymentReference,
		totalAmount: 2500,
		currency: 'NGN',
		createdAt: new Date(),
		paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
	};
}

function verificationResult(paymentReference = 'ORD_STORED') {
	return {
		success: true,
		status: 'PAID',
		transactionReference: 'MNFY|SUCCESS',
		paymentReference,
		amount: 2500,
		amountPaid: 2500,
		currency: 'NGN',
		channel: 'ACCOUNT_TRANSFER',
		metaData: { orderId }
	};
}

async function callVerify(body: Record<string, unknown>, localsUser: unknown = user) {
	return POST({
		request: new Request('https://smm.fastaccs.com/api/payments/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-request-id': 'verify-trace' },
			body: JSON.stringify(body)
		}),
		locals: { user: localsUser }
	} as never);
}

describe('approved invariant: redirect payment verification boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('never verifies or settles for an unauthenticated request', async () => {
		const response = await callVerify({ orderId }, null);

		expect(response.status).toBe(401);
		expect(mocks.verifyPayment).not.toHaveBeenCalled();
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
	});

	it('rejects verified payment evidence bound to a different stored reference', async () => {
		mocks.findOrderById.mockResolvedValue(pendingOrder('ORD_STORED'));
		mocks.verifyPayment.mockResolvedValue(verificationResult('ORD_DIFFERENT'));

		const response = await callVerify({
			orderId,
			paymentReference: 'ORD_DIFFERENT'
		});

		expect(response.status).toBe(409);
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
	});

	it('settles matching server-verified payment evidence exactly once', async () => {
		mocks.findOrderById.mockResolvedValue(pendingOrder());
		mocks.verifyPayment.mockResolvedValue(verificationResult());
		mocks.settleSuccessfulPayment.mockResolvedValue({
			success: true,
			orderId,
			status: 'COMPLETED'
		});

		const response = await callVerify({ orderId, paymentReference: 'ORD_STORED' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, state: 'SUCCESS', status: 'COMPLETED', orderId });
		expect(mocks.settleSuccessfulPayment).toHaveBeenCalledOnce();
		expect(mocks.settleSuccessfulPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId,
				source: 'verify',
				paymentReference: 'ORD_STORED',
				amountPaid: 2500,
				currency: 'NGN'
			})
		);
	});
});

