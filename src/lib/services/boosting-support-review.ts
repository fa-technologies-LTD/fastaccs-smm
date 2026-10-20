import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { BOOST_REVIEW_AFTER_MS, isBoostOrderOverdue } from '$lib/helpers/boosting-overdue-review';

export function overdueBoostItemsWhere(now = new Date()): Prisma.OrderItemWhereInput {
	const cutoff = new Date(now.getTime() - BOOST_REVIEW_AFTER_MS);
	return {
		AND: [
			{ boostTargetUrl: { not: null } },
			{
				OR: [
					{ boostFulfillmentStatus: null },
					{ boostFulfillmentStatus: { notIn: ['completed', 'rejected', 'cancelled'] } }
				]
			},
			{
				order: {
					orderType: 'boosting',
					paymentStatus: { in: ['paid', 'success', 'overpaid'] },
					status: { notIn: ['refunded', 'cancelled'] },
					deliveryStatus: { not: 'refunded' },
					OR: [{ paidAt: { lte: cutoff } }, { paidAt: null, createdAt: { lte: cutoff } }]
				}
			}
		]
	};
}

/** Support-only job: one durable admin notification per order; no supplier calls or delivery mutations. */
export async function reviewOverdueBoostOrders(database: PrismaClient = prisma, now = new Date()) {
	const recipients = await database.adminRoleAssignment.findMany({
		where: {
			role: { in: ['FULL_ADMIN', 'ORDER_MANAGER', 'ASSISTANT'] },
			user: { isActive: true, userType: 'ADMIN' }
		},
		select: { userId: true }
	});
	if (!recipients.length) return { processed: 0, notified: 0, reason: 'no_support_admins' };
	const rows = await database.$queryRaw<Array<{ id: string; orderId: string }>>(Prisma.sql`
		SELECT DISTINCT ON (o.id) i.id, o.id AS "orderId" FROM order_items i JOIN orders o ON o.id=i.order_id
		WHERE o.order_type='boosting' AND o.payment_status IN ('paid','success','overpaid')
		AND o.status NOT IN ('refunded','cancelled') AND o.delivery_status<>'refunded'
		AND i.boost_target_url IS NOT NULL AND (i.boost_fulfillment_status IS NULL OR i.boost_fulfillment_status NOT IN ('completed','rejected','cancelled'))
		AND COALESCE(o.paid_at,o.created_at) <= ${new Date(now.getTime() - BOOST_REVIEW_AFTER_MS)}
		AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.idempotency_key='boost-overdue:' || o.id::text)
		ORDER BY o.id,i.created_at LIMIT 100
	`);
	let notified = 0;
	for (const row of rows) {
		notified += await database.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM orders WHERE id=${row.orderId}::uuid FOR UPDATE`;
			const item = await tx.orderItem.findUnique({
				where: { id: row.id },
				select: {
					orderId: true,
					boostFulfillmentStatus: true,
					order: {
						select: {
							orderNumber: true,
							paymentStatus: true,
							status: true,
							deliveryStatus: true,
							paidAt: true,
							createdAt: true
						}
					}
				}
			});
			if (!item || item.orderId !== row.orderId || !isBoostOrderOverdue(item, now)) return 0;
			const marker = await tx.orderEvent.createMany({
				skipDuplicates: true,
				data: {
					orderId: row.orderId,
					orderItemId: row.id,
					type: 'boosting_review_due',
					source: 'support_review',
					idempotencyKey: `boost-overdue:${row.orderId}`,
					occurredAt: now,
					description:
						'This paid delivery item has reached the 24-hour support review checkpoint. Check the latest evidence; elapsed time alone does not confirm delivery or failure.'
				}
			});
			if (!marker.count) return 0;
			await tx.notification.createMany({
				data: recipients.map((r) => ({
					userId: r.userId,
					orderId: row.orderId,
					type: 'admin_order_review',
					title: 'Order needs a delivery check',
					message: `${item.order.orderNumber} needs a delivery review after 24 hours. Check the latest supplier response and what the customer received.`
				}))
			});
			return 1;
		});
	}
	return { processed: rows.length, notified };
}
