import { prisma } from '$lib/prisma';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { REFUNDED_MARKER } from '$lib/helpers/order-revenue';
import { toNetSales } from '$lib/helpers/order-revenue';
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

	const [completedOrders, spending, ownedAccounts] = await Promise.all([
		prisma.order.count({ where: revenueWhere }),
		prisma.order.aggregate({
			where: revenueWhere,
			_sum: { totalAmount: true, refundedAmount: true }
		}),
		prisma.account.count({
			where: {
				status: { in: [...getAllocatedLikeAccountStatuses(), 'delivered'] },
				orderItem: { order: revenueWhere }
			}
		})
	]);

	return {
		completedOrders,
		totalSpent: toNetSales(spending._sum.totalAmount, spending._sum.refundedAmount),
		accountsOwned: ownedAccounts
	};
}
