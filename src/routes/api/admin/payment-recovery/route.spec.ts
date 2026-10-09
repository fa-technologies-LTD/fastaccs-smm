import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	permission: vi.fn(),
	webhooks: { findMany: vi.fn(), updateMany: vi.fn() },
	refunds: { findMany: vi.fn() },
	audit: vi.fn(),
	analytics: vi.fn()
}));
vi.mock('$lib/services/refund-analytics', () => ({ listRefundAnalyticsReview: mocks.analytics }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.permission }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		paymentWebhookInbox: mocks.webhooks,
		refundRecoveryTask: mocks.refunds,
		$transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({ paymentWebhookInbox: mocks.webhooks, adminAuditLog: { create: mocks.audit } })
	}
}));
import { GET, POST } from './+server';
const id = '11111111-1111-4111-8111-111111111111';
const event = () =>
	({
		locals: { user: { id }, adminContext: {} },
		request: new Request('https://smm.fastaccs.com/api/admin/payment-recovery', {
			method: 'POST',
			body: JSON.stringify({ id })
		})
	}) as never;
describe('admin payment recovery controls', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.permission.mockReturnValue(true);
		mocks.webhooks.findMany.mockResolvedValue([]);
		mocks.refunds.findMany.mockResolvedValue([]);
		mocks.analytics.mockResolvedValue([]);
		mocks.webhooks.updateMany.mockResolvedValue({ count: 1 });
	});
	it('requires order-management permission for reads and retries', async () => {
		mocks.permission.mockReturnValue(false);
		expect((await GET(event())).status).toBe(401);
		expect((await POST(event())).status).toBe(401);
		expect(mocks.webhooks.updateMany).not.toHaveBeenCalled();
		expect(mocks.analytics).not.toHaveBeenCalled();
	});
	it('lists reporting holds without adding an unsafe resend control or private analytics data', async () => {
		mocks.analytics.mockResolvedValue([
			{ id, orderNumber: 'ORD-TEST', reason: 'delivery_unknown' }
		]);
		const result = await GET(event());
		expect(await result.json()).toEqual({
			webhooks: [],
			refunds: [],
			refundAnalytics: [{ id, orderNumber: 'ORD-TEST', reason: 'delivery_unknown' }]
		});
		expect(mocks.webhooks.updateMany).not.toHaveBeenCalled();
	});
	it('lists bounded outstanding queues without exposing raw webhook payloads', async () => {
		expect((await GET(event())).status).toBe(200);
		expect(mocks.webhooks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ take: 50, select: expect.not.objectContaining({ payload: true }) })
		);
	});
	it('only retries quarantined work, audits the action, and never releases an order', async () => {
		expect((await POST(event())).status).toBe(200);
		expect(mocks.webhooks.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id, status: 'quarantined' },
				data: expect.objectContaining({ status: 'pending', attempts: 0 })
			})
		);
		expect(mocks.audit).toHaveBeenCalledOnce();
	});
	it('does not steal another worker’s lease or retry a completed event', async () => {
		mocks.webhooks.updateMany.mockResolvedValue({ count: 0 });
		expect((await POST(event())).status).toBe(409);
		expect(mocks.audit).not.toHaveBeenCalled();
	});
});
