import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	inbox: { upsert: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
	process: vi.fn(),
	alert: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: { paymentWebhookInbox: mocks.inbox } }));
vi.mock('./monnify-webhook-processing', () => ({ processMonnifyWebhookEvent: mocks.process }));
vi.mock('$lib/services/admin-alerts', () => ({ sendCriticalAdminAlert: mocks.alert }));
import {
	drainPaymentWebhookInbox,
	normalizeWebhookPayload,
	receivePaymentWebhook
} from './payment-webhook-inbox';

const payload = { eventType: 'SUCCESSFUL_TRANSACTION', eventData: { paymentReference: 'ORD_1' } };
const row = { id: 'event', status: 'pending', attempts: 0, leaseExpiresAt: null, payload };
describe('payment webhook durable retry queue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inbox.findMany.mockResolvedValue([row]);
		mocks.inbox.updateMany.mockResolvedValue({ count: 1 });
		mocks.alert.mockResolvedValue(undefined);
	});
	it('deduplicates signed events without resetting previously completed work', async () => {
		await receivePaymentWebhook(payload);
		await receivePaymentWebhook(payload);
		expect(mocks.inbox.upsert.mock.calls[0][0]).toEqual(mocks.inbox.upsert.mock.calls[1][0]);
		expect(mocks.inbox.upsert.mock.calls[0][0].update).toEqual({});
	});
	it('does not store customer/bank data', () => {
		expect(
			normalizeWebhookPayload({
				...payload,
				eventData: { ...payload.eventData, customer: { bank: 'private' } }
			})
		).toEqual(payload);
	});
	it('does not process work claimed by another worker', async () => {
		mocks.inbox.updateMany.mockResolvedValue({ count: 0 });
		await drainPaymentWebhookInbox();
		expect(mocks.process).not.toHaveBeenCalled();
	});
	it('retries temporary verification failure durably', async () => {
		mocks.process.mockResolvedValue(Response.json({ success: false }, { status: 503 }));
		expect(await drainPaymentWebhookInbox()).toMatchObject({ retried: 1 });
		expect(mocks.inbox.updateMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'pending', leaseExpiresAt: null })
			})
		);
	});
	it('finishes successful work and quarantines unsafe permanent failures', async () => {
		mocks.process.mockResolvedValue(Response.json({ success: true }));
		expect(await drainPaymentWebhookInbox()).toMatchObject({ processed: 1 });
		mocks.process.mockResolvedValue(Response.json({ success: false }));
		expect(await drainPaymentWebhookInbox()).toMatchObject({ quarantined: 1 });
		expect(mocks.alert).toHaveBeenCalledOnce();
	});
	it('quarantines exhausted retries instead of silently losing work', async () => {
		mocks.inbox.findMany.mockResolvedValue([
			{ ...row, status: 'processing', attempts: 11, leaseExpiresAt: new Date(0) }
		]);
		mocks.process.mockRejectedValue(new Error('network unavailable'));
		expect(await drainPaymentWebhookInbox()).toMatchObject({ quarantined: 1 });
	});
});
