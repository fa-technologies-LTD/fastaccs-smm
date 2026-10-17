import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	send: vi.fn(),
	recipients: vi.fn(),
	db: {
		microcopy: { findUnique: vi.fn(), upsert: vi.fn() },
		orderItem: { findMany: vi.fn() },
		emailNotification: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() }
	}
}));
vi.mock('$lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('./email', () => ({ sendEmail: mocks.send }));
vi.mock('./admin-settings', () => ({ getOperationalAlertRecipients: mocks.recipients }));
import { emailBoostingAttention } from './boosting-attention-email';
const now = new Date('2026-10-16T12:00:00Z');
function item(id: string, reason: string | null = null) {
	return {
		id,
		orderId: `order-${id}`,
		boostFulfillmentStatus: reason ? 'under_review' : null,
		boostFulfillment: reason ? { lastSafeErrorCategory: reason } : null,
		order: {
			orderNumber: `ORD-${id}`,
			paidAt: new Date('2026-10-14T12:00:00Z'),
			createdAt: new Date('2026-10-14T12:00:00Z')
		}
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.recipients.mockResolvedValue(['owner@example.invalid']);
	mocks.db.microcopy.findUnique.mockResolvedValue(null);
	mocks.db.microcopy.upsert.mockResolvedValue({});
	mocks.db.orderItem.findMany.mockResolvedValue([item('a'), item('b', 'submission_unknown')]);
	mocks.db.emailNotification.findMany.mockResolvedValue([]);
	mocks.db.emailNotification.findFirst.mockResolvedValue(null);
	mocks.send.mockResolvedValue({ success: true });
	mocks.db.emailNotification.createMany.mockResolvedValue({ count: 2 });
});
it('groups overdue and recorded failures, distinguishes delay from failure and makes no supplier calls', async () => {
	expect(await emailBoostingAttention()).toEqual({ sent: 1 });
	expect(mocks.send).toHaveBeenCalledTimes(1);
	expect(mocks.send.mock.calls[0][0]).toMatchObject({
		subject: 'Action needed: 2 Boosting orders',
		classification: 'operational'
	});
	expect(mocks.send.mock.calls[0][0].body).toContain('not confirmed failure');
	expect(mocks.send.mock.calls[0][0].body).toContain('do not submit again');
	expect(mocks.db.emailNotification.createMany.mock.calls[0][0].data).toHaveLength(2);
});
it('does not resend successfully covered incidents on a later run', async () => {
	mocks.db.emailNotification.findMany.mockResolvedValue([
		{ email: 'owner@example.invalid', referenceId: 'boost-attention:a:overdue' },
		{ email: 'owner@example.invalid', referenceId: 'boost-attention:b:submission_unknown' }
	]);
	expect(await emailBoostingAttention()).toEqual({ sent: 0 });
	expect(mocks.send).not.toHaveBeenCalled();
});
it('records coverage only for recipients whose send succeeded, leaving failed work retryable', async () => {
	mocks.send.mockResolvedValue({ success: false });
	await expect(emailBoostingAttention()).rejects.toThrow('could not be sent');
	expect(mocks.db.emailNotification.createMany).not.toHaveBeenCalled();
	expect(mocks.db.microcopy.upsert).not.toHaveBeenCalled();
});
it('recovers coverage without sending when the exact batch already has a sent log', async () => {
	mocks.db.emailNotification.findFirst.mockResolvedValue({ id: 'sent' });
	expect(await emailBoostingAttention()).toEqual({ sent: 0 });
	expect(mocks.send).not.toHaveBeenCalled();
	expect(mocks.db.emailNotification.createMany).toHaveBeenCalledOnce();
});
it('rotates full candidate pages so old already-alerted orders cannot starve newer ones', async () => {
	const cursor = '11111111-1111-4111-8111-111111111111';
	mocks.db.microcopy.findUnique.mockResolvedValue({ value: cursor });
	mocks.db.orderItem.findMany.mockResolvedValue(
		Array.from({ length: 100 }, (_, i) => item(String(i)))
	);
	await emailBoostingAttention();
	expect(mocks.db.orderItem.findMany.mock.calls[0][0]).toMatchObject({
		cursor: { id: cursor },
		skip: 1,
		take: 100
	});
	expect(mocks.db.microcopy.upsert.mock.calls[0][0].update).toMatchObject({
		value: '99',
		isActive: false
	});
});
it('skips intentional queued overlap/shadow states until overdue, and skips absent recipients', async () => {
	mocks.db.orderItem.findMany.mockResolvedValue([
		{
			...item('a', 'target_already_active'),
			order: { orderNumber: 'ORD-a', paidAt: now, createdAt: now }
		}
	]);
	expect(await emailBoostingAttention(mocks.db as never, now)).toEqual({ sent: 0 });
	expect(mocks.send).not.toHaveBeenCalled();
	mocks.recipients.mockResolvedValue([]);
	mocks.db.orderItem.findMany.mockClear();
	await emailBoostingAttention();
	expect(mocks.db.orderItem.findMany).not.toHaveBeenCalled();
});
