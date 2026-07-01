import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';

// Lightweight "needs attention" counts for the admin sidebar badges.
// Read-only, side-effect free, keyed by nav href so the layout can map directly.
export const GET: RequestHandler = async () => {
	const [orders, boostingOrders] = await Promise.all([
		// Account orders that are paid but not yet delivered — awaiting fulfillment.
		prisma.order.count({
			where: {
				orderType: 'account',
				status: { in: [...ORDER_STATUS_GROUPS.processing] },
				deliveryStatus: 'pending'
			}
		}),
		// Paid boosting line-items still pending fulfillment.
		prisma.orderItem.count({
			where: {
				boostTargetUrl: { not: null },
				boostFulfillmentStatus: 'pending',
				order: { paymentStatus: 'paid' }
			}
		})
	]);

	return json({
		'/admin/orders': orders,
		'/admin/boosting-orders': boostingOrders
	});
};
