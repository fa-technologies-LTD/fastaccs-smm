import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signature: vi.fn(), receive: vi.fn(), drain: vi.fn() }));
vi.mock('$lib/services/payment', () => ({ verifyWebhookSignature: mocks.signature }));
vi.mock('$lib/services/payment-webhook-inbox', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/services/payment-webhook-inbox')>();
	return {
		normalizeWebhookPayload: real.normalizeWebhookPayload,
		receivePaymentWebhook: mocks.receive,
		drainPaymentWebhookInbox: mocks.drain
	};
});
import { POST } from './+server';
function call() {
	return POST({
		request: new Request('https://smm.fastaccs.com/api/webhooks/monnify', {
			method: 'POST',
			headers: { 'monnify-signature': 'signature' },
			body: JSON.stringify({
				eventType: 'SUCCESSFUL_TRANSACTION',
				eventData: { paymentReference: 'ORD_1', customer: { bank: 'private' } }
			})
		})
	} as never);
}
describe('durable webhook acknowledgement', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.signature.mockReturnValue(true);
		mocks.receive.mockResolvedValue('event-key');
		mocks.drain.mockResolvedValue({ processed: 1 });
	});
	it('rejects invalid signatures without writing to the inbox', async () => {
		mocks.signature.mockReturnValue(false);
		expect((await call()).status).toBe(401);
		expect(mocks.receive).not.toHaveBeenCalled();
	});
	it('acknowledges only after inbox persistence and excludes private payload fields', async () => {
		expect((await call()).status).toBe(200);
		expect(mocks.receive).toHaveBeenCalledWith({
			eventType: 'SUCCESSFUL_TRANSACTION',
			eventData: { paymentReference: 'ORD_1' }
		});
		expect(mocks.drain).toHaveBeenCalledWith(1, 'event-key');
	});
	it('requests redelivery if persistence fails', async () => {
		mocks.receive.mockRejectedValue(new Error('database unavailable'));
		expect((await call()).status).toBe(503);
		expect(mocks.drain).not.toHaveBeenCalled();
	});
	it('acknowledges a durably saved event when immediate processing fails', async () => {
		mocks.drain.mockRejectedValue(new Error('worker unavailable'));
		expect((await call()).status).toBe(200);
		expect(mocks.receive).toHaveBeenCalledOnce();
	});
});
