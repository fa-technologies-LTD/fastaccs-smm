import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';
import { BOOST_OPEN_COMPLAINT_STATUSES } from '$lib/helpers/boosting-admin-status';

// Lightweight "needs attention" counts for the admin sidebar badges.
// Read-only, side-effect free, keyed by nav href so the layout can map directly.
export const GET: RequestHandler = async () => {
	const [orders, boostingOrders, outOfStock, bankDetails, heldPayments, refundTasks] =
		await Promise.all([
			// Account orders that are paid but not yet delivered — awaiting fulfillment.
			prisma.order.count({
				where: {
					orderType: 'account',
					status: { in: [...ORDER_STATUS_GROUPS.processing] },
					deliveryStatus: 'pending'
				}
			}),
			// Paid boosting line-items that need an admin decision or customer follow-up.
			prisma.orderItem.count({
				where: {
					boostTargetUrl: { not: null },
					OR: [
						{ boostFulfillmentStatus: null },
						{
							boostFulfillmentStatus: {
								in: ['pending', 'needs_link', 'rejected', 'under_review', 'partial', 'cancelled']
							}
						},
						{
							boostFulfillment: {
								is: { complaints: { some: { status: { in: [...BOOST_OPEN_COMPLAINT_STATUSES] } } } }
							}
						}
					],
					order: { paymentStatus: { in: ['paid', 'success', 'overpaid'] } }
				}
			}),
			// Active tiers with zero available accounts — out of stock (needs restock).
			// Manual-handover and auto-SMS (Numbers) tiers are excluded: they have no
			// account inventory and their availability is not a stock count.
			prisma.category.count({
				where: {
					categoryType: 'tier',
					isActive: true,
					parentId: { not: null },
					accounts: { none: { status: 'available' } },
					NOT: [
						{ metadata: { path: ['delivery_mode'], equals: 'manual_handover' } },
						{ metadata: { path: ['delivery_mode'], equals: 'auto_sms' } }
					]
				}
			}),
			// Affiliate bank details waiting for the owner's review.
			prisma.affiliatePayoutDetails.count({ where: { status: 'pending' } }),
			// Payment issues: webhooks held for a person, and refunds whose follow-up did not finish.
			prisma.paymentWebhookInbox.count({ where: { status: 'quarantined' } }),
			prisma.refundRecoveryTask.count({ where: { status: { not: 'completed' } } })
		]);

	return json({
		'/admin/orders': orders,
		'/admin/boosting-orders': boostingOrders,
		'/admin/inventory': outOfStock,
		'/admin/affiliates': bankDetails,
		'/admin/payment-recovery': heldPayments + refundTasks
	});
};
