import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyWebhookSignature: vi.fn(),
	verifyPayment: vi.fn(),
	findOrder: vi.fn(),
	settleSuccessfulPayment: vi.fn(),
	settleFailedPayment: vi.fn()
}));

vi.mock('$lib/services/payment', () => ({
	verifyWebhookSignature: mocks.verifyWebhookSignature,
	verifyPayment: mocks.verifyPayment
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findFirst: mocks.findOrder
		}
	}
}));

vi.mock('$lib/services/payment-settlement', () => ({
	settleSuccessfulPayment: mocks.settleSuccessfulPayment,
	settleFailedPayment: mocks.settleFailedPayment
}));

vi.mock('$lib/services/admin-alerts', () => ({
	sendCriticalAdminAlert: vi.fn(async () => undefined)
}));

import { POST } from './+server';

function webhookRequest(eventData: Record<string, unknown>, signature = 'valid-signature') {
	return new Request('https://smm.fastaccs.com/api/webhooks/monnify', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'monnify-signature': signature,
			'x-request-id': 'webhook-trace'
		},
		body: JSON.stringify({
			eventType: 'SUCCESSFUL_TRANSACTION',
			eventData
		})
	});
}

async function callWebhook(request: Request) {
	return POST({ request } as never);
}

describe('approved invariant: Monnify webhook boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('never verifies or settles an invalidly signed webhook', async () => {
		mocks.verifyWebhookSignature.mockReturnValue(false);

		const response = await callWebhook(
			webhookRequest(
				{ transactionReference: 'MNFY|BAD', paymentReference: 'ORD_BAD' },
				'invalid-signature'
			)
		);

		expect(response.status).toBe(401);
		expect(mocks.verifyPayment).not.toHaveBeenCalled();
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
		expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
	});

	it('settles a server-verified successful transaction exactly once', async () => {
		mocks.verifyWebhookSignature.mockReturnValue(true);
		mocks.verifyPayment.mockResolvedValue({
			success: true,
			status: 'PAID',
			transactionReference: 'MNFY|SUCCESS',
			paymentReference: 'ORD_SUCCESS',
			amount: 2500,
			amountPaid: 2500,
			currency: 'NGN',
			channel: 'ACCOUNT_TRANSFER',
			metaData: { orderId: 'order-123' }
		});
		mocks.settleSuccessfulPayment.mockResolvedValue({
			success: true,
			orderId: 'order-123',
			status: 'COMPLETED'
		});

		const response = await callWebhook(
			webhookRequest({
				transactionReference: 'MNFY|SUCCESS',
				paymentReference: 'ORD_SUCCESS',
				paymentStatus: 'PAID'
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.verifyPayment).toHaveBeenCalledOnce();
		expect(mocks.settleSuccessfulPayment).toHaveBeenCalledOnce();
		expect(mocks.settleSuccessfulPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: 'order-123',
				source: 'webhook',
				paymentReference: 'ORD_SUCCESS',
				amountPaid: 2500,
				currency: 'NGN'
			})
		);
	});

	it('does not settle a success event that server verification cannot confirm', async () => {
		mocks.verifyWebhookSignature.mockReturnValue(true);
		mocks.verifyPayment.mockResolvedValue({
			success: false,
			status: 'PENDING',
			transactionReference: 'MNFY|PENDING',
			paymentReference: 'ORD_PENDING',
			amount: 2500,
			amountPaid: 0,
			currency: 'NGN',
			metaData: { orderId: 'order-123' }
		});

		const response = await callWebhook(
			webhookRequest({
				transactionReference: 'MNFY|PENDING',
				paymentReference: 'ORD_PENDING',
				paymentStatus: 'PAID'
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
		expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
	});
});

