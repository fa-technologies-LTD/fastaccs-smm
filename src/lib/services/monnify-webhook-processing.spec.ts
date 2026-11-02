import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyWebhookSignature: vi.fn(),
	verifyPayment: vi.fn(),
	findOrder: vi.fn(),
	settleSuccessfulPayment: vi.fn(),
	settleFailedPayment: vi.fn(),
	recordOrderEvent: vi.fn()
}));

vi.mock('$lib/services/payment', () => ({
	verifyWebhookSignature: mocks.verifyWebhookSignature,
	verifyPayment: mocks.verifyPayment
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder
		}
	}
}));

vi.mock('$lib/services/payment-settlement', () => ({
	settleSuccessfulPayment: mocks.settleSuccessfulPayment,
	settleFailedPayment: mocks.settleFailedPayment
}));

vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));

vi.mock('$lib/services/admin-alerts', () => ({
	sendCriticalAdminAlert: vi.fn(async () => undefined)
}));

import { processMonnifyWebhookEvent } from './monnify-webhook-processing';

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
	return processMonnifyWebhookEvent(await request.json(), 'test-trace');
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
		mocks.findOrder.mockResolvedValue({
			id: 'order-123',
			paymentReference: 'ORD_SUCCESS'
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

	it('holds a verified payment when its reference conflicts with the resolved order', async () => {
		mocks.verifyWebhookSignature.mockReturnValue(true);
		mocks.verifyPayment.mockResolvedValue({
			success: true,
			status: 'PAID',
			transactionReference: 'MNFY|OLD',
			paymentReference: 'ORD_OLD',
			amount: 2500,
			amountPaid: 2500,
			currency: 'NGN',
			metaData: { orderId: 'order-123' }
		});
		mocks.findOrder.mockResolvedValue({
			id: 'order-123',
			paymentReference: 'ORD_CURRENT'
		});

		const response = await callWebhook(
			webhookRequest({
				transactionReference: 'MNFY|OLD',
				paymentReference: 'ORD_OLD',
				paymentStatus: 'PAID'
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: false });
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
		expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
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

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ success: false, retryable: true });
		expect(mocks.settleSuccessfulPayment).not.toHaveBeenCalled();
		expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
	});

	describe('a transfer Monnify refused', () => {
		const order = { id: 'order-123', paymentReference: 'ORD_123' };
		const refused = {
			transactionReference: 'MNFY|34|1',
			paymentReference: 'ORD_123',
			rejectionReason: 'UNDER_PAYMENT',
			expectedAmount: '10500',
			amountSent: '10000',
			rejectedAt: '2026-11-02 05:06:44.0'
		};
		const gateway = (status: string) => ({
			success: status === 'PAID',
			status,
			transactionReference: 'MNFY|34|1',
			paymentReference: 'ORD_123',
			amount: 10500,
			amountPaid: status === 'PAID' ? 10500 : 0,
			currency: 'NGN',
			metaData: { orderId: 'order-123' }
		});
		const refuse = () =>
			processMonnifyWebhookEvent({ eventType: 'REJECTED_PAYMENT', eventData: refused }, 'trace');
		beforeEach(() => mocks.findOrder.mockResolvedValue(order));

		it('keeps the order open while Monnify still has the payment open, and records why', async () => {
			mocks.verifyPayment.mockResolvedValue(gateway('PENDING'));
			const response = await refuse();
			expect(await response.json()).toEqual({ success: true });
			expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
			expect(mocks.recordOrderEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					orderId: 'order-123',
					type: 'payment_transfer_declined',
					amount: 10000,
					description:
						'Monnify refused a transfer (less than the order total): sent ₦10,000, expected ₦10,500. The payment stays open.',
					idempotencyKey: 'monnify-declined:MNFY|34|1:2026-11-02 05:06:44.0',
					metadata: expect.objectContaining({
						reason: 'UNDER_PAYMENT',
						expectedAmount: 10500,
						amountSent: 10000
					})
				})
			);
		});

		it('also stays open when Monnify cannot be reached to check', async () => {
			mocks.verifyPayment.mockResolvedValue(gateway(''));
			await refuse();
			expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
			expect(mocks.recordOrderEvent).toHaveBeenCalledOnce();
		});

		it('closes the order only when Monnify itself reports the payment closed', async () => {
			mocks.verifyPayment.mockResolvedValue(gateway('EXPIRED'));
			await refuse();
			expect(mocks.settleFailedPayment).toHaveBeenCalledWith(
				expect.objectContaining({ orderId: 'order-123', failureKind: 'cancelled' })
			);
			expect(mocks.recordOrderEvent).not.toHaveBeenCalled();
		});

		it('settles the order when the payment has in fact been paid', async () => {
			mocks.verifyPayment.mockResolvedValue(gateway('PAID'));
			mocks.settleSuccessfulPayment.mockResolvedValue({ success: true });
			await refuse();
			expect(mocks.settleSuccessfulPayment).toHaveBeenCalledOnce();
			expect(mocks.settleFailedPayment).not.toHaveBeenCalled();
		});

		it('still fails a card payment Monnify reports as failed', async () => {
			mocks.verifyPayment.mockResolvedValue(gateway('PENDING'));
			await processMonnifyWebhookEvent(
				{ eventType: 'FAILED_TRANSACTION', eventData: { paymentReference: 'ORD_123' } },
				'trace'
			);
			expect(mocks.settleFailedPayment).toHaveBeenCalledWith(
				expect.objectContaining({ orderId: 'order-123', failureKind: 'failed' })
			);
			expect(mocks.recordOrderEvent).not.toHaveBeenCalled();
		});
	});
});
