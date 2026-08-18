import { prisma } from '$lib/prisma';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { REFUNDED_MARKER } from '$lib/helpers/order-revenue';
import type { Prisma } from '@prisma/client';

export async function getDashboardMetrics(userId: string) {
	// Mirrors isRevenueOrder(): a refunded order is money the customer got back, so it must not
	// keep inflating their "total spent". Different refund paths mark different columns (full →
	// status+paymentStatus, per-account → paymentStatus, Numbers auto-refund → all three), so all
	// three are excluded. Deliberately NOT swapped for buildRevenueOrderWhere(): that helper also
	// drops manual_release orders, which is an admin-revenue concern, not a buyer-facing one.
	const revenueWhere: Prisma.OrderWhereInput = {
		userId,
		OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }],
		AND: [
			{ status: { not: REFUNDED_MARKER } },
			{ paymentStatus: { not: REFUNDED_MARKER } },
			{ deliveryStatus: { not: REFUNDED_MARKER } }
		]
	};

	const [completedOrders, spending, purchasedItems] = await Promise.all([
		prisma.order.count({ where: revenueWhere }),
		prisma.order.aggregate({
			where: revenueWhere,
			_sum: { totalAmount: true }
		}),
		prisma.orderItem.aggregate({
			where: {
				productCategory: { not: 'boosting_service' },
				order: {
					userId,
					OR: [{ status: { in: ['paid', 'processing', 'completed'] } }, { paymentStatus: 'paid' }]
				},
				OR: [
					{ accounts: { some: { status: { in: [...getAllocatedLikeAccountStatuses(), 'delivered'] } } } },
					{ order: { deliveryMethod: 'whatsapp' } }
				]
			},
			_sum: { quantity: true }
		})
	]);

	return {
		completedOrders,
		totalSpent: Number(spending._sum.totalAmount || 0),
		accountsOwned: Number(purchasedItems._sum.quantity || 0)
	};
}
