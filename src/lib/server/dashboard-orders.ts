import { prisma } from '$lib/prisma';

export const DASHBOARD_ORDERS_PAGE_SIZE = 20;

export async function getDashboardOrdersPage(input: {
	userId: string;
	cursor?: string | null;
	limit?: number;
}) {
	const limit = Math.max(1, Math.min(50, Math.floor(input.limit || DASHBOARD_ORDERS_PAGE_SIZE)));
	const rows = await prisma.order.findMany({
		where: { userId: input.userId },
		select: {
			id: true,
			orderNumber: true,
			totalAmount: true,
			refundedAmount: true,
			status: true,
			paymentStatus: true,
			paymentReference: true,
			deliveryStatus: true,
			deliveryMethod: true,
			createdAt: true,
			orderItems: {
				select: {
					id: true,
					categoryId: true,
					productName: true,
					quantity: true,
					unitPrice: true,
					totalPrice: true,
					refundedAmount: true,
					allocationStatus: true,
					boostTargetUrl: true,
					boostQuantity: true,
					boostFulfillmentStatus: true
				}
			}
		},
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
		take: limit + 1
	});

	const hasMore = rows.length > limit;
	const orders = (hasMore ? rows.slice(0, limit) : rows).map((order) => ({
		...order,
		totalAmount: Number(order.totalAmount),
		refundedAmount: Number(order.refundedAmount),
		orderItems: order.orderItems.map((item) => ({
			...item,
			unitPrice: Number(item.unitPrice),
			totalPrice: Number(item.totalPrice),
			refundedAmount: Number(item.refundedAmount)
		}))
	}));
	return {
		orders,
		nextCursor: hasMore ? orders.at(-1)?.id || null : null
	};
}
