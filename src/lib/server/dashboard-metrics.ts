import { prisma } from '$lib/prisma';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import type { Prisma } from '@prisma/client';

export async function getDashboardMetrics(userId: string) {
	const revenueWhere: Prisma.OrderWhereInput = {
		userId,
		OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
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
