import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	orderItem: { findUnique: vi.fn() },
	orderEvent: { createMany: vi.fn() },
	notification: { createMany: vi.fn() }
}));
const db = vi.hoisted(() => ({
	adminRoleAssignment: { findMany: vi.fn() },
	$queryRaw: vi.fn(),
	$transaction: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: db }));
import { overdueBoostItemsWhere, reviewOverdueBoostOrders } from './boosting-support-review';
import { getNotificationActionUrl } from './notifications';
beforeEach(() => {
	vi.clearAllMocks();
	db.adminRoleAssignment.findMany.mockResolvedValue([{ userId: 'admin' }]);
	db.$queryRaw.mockResolvedValue([{ id: 'item', orderId: 'order' }]);
	db.$transaction.mockImplementation(async (fn) => fn(tx));
	tx.orderItem.findUnique.mockResolvedValue({
		orderId: 'order',
		boostFulfillmentStatus: 'partial',
		order: {
			orderNumber: 'ORD-1',
			paymentStatus: 'paid',
			status: 'paid',
			deliveryStatus: 'processing',
			paidAt: new Date('2026-10-13T12:00:00Z')
		}
	});
	tx.orderEvent.createMany.mockResolvedValue({ count: 1 });
});
const now = new Date('2026-10-14T12:00:00Z');
it('commits one support marker and admin notifications without delivery or financial mutations', async () => {
	expect(await reviewOverdueBoostOrders(db as never, now)).toEqual({ processed: 1, notified: 1 });
	expect(tx.orderEvent.createMany).toHaveBeenCalledWith(
		expect.objectContaining({
			skipDuplicates: true,
			data: expect.objectContaining({ idempotencyKey: 'boost-overdue:order' })
		})
	);
	expect(tx.notification.createMany).toHaveBeenCalledWith({
		data: [
			expect.objectContaining({ userId: 'admin', orderId: 'order', type: 'admin_order_review' })
		]
	});
	expect(db.adminRoleAssignment.findMany.mock.calls[0][0].where.role.in).not.toContain('READ_ONLY');
});
it('does not notify twice when another worker recorded the same order', async () => {
	tx.orderEvent.createMany.mockResolvedValue({ count: 0 });
	expect((await reviewOverdueBoostOrders(db as never, now)).notified).toBe(0);
	expect(tx.notification.createMany).not.toHaveBeenCalled();
});
it('rechecks completion or refund under the shared order lock', async () => {
	tx.orderItem.findUnique.mockResolvedValue({
		orderId: 'order',
		boostFulfillmentStatus: 'completed',
		order: { paymentStatus: 'paid' }
	});
	expect((await reviewOverdueBoostOrders(db as never, now)).notified).toBe(0);
	expect(tx.orderEvent.createMany).not.toHaveBeenCalled();
});
it('does not consume notification markers when no support admins exist', async () => {
	db.adminRoleAssignment.findMany.mockResolvedValue([]);
	expect((await reviewOverdueBoostOrders(db as never, now)).reason).toBe('no_support_admins');
	expect(db.$queryRaw).not.toHaveBeenCalled();
});
it('uses paid time, excludes refunds and routes admin alerts to admin order detail', () => {
	expect(JSON.stringify(overdueBoostItemsWhere(now))).toContain('2026-10-13T12:00:00.000Z');
	expect(JSON.stringify(overdueBoostItemsWhere(now))).toContain('refunded');
	expect(getNotificationActionUrl('admin_order_review', 'order')).toBe('/admin/orders/order');
	expect(getNotificationActionUrl('boosting_issue', 'order')).toBe('/order/order');
});
