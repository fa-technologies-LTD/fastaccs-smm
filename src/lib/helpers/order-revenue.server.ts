import type { Prisma } from '@prisma/client';
import { REVENUE_ORDER_STATUSES } from './order-revenue';

function buildDateWindow(gte: Date, lte?: Date): { gte: Date; lte?: Date } {
	return lte ? { gte, lte } : { gte };
}

export function buildRevenueOrderWhere(): Prisma.OrderWhereInput {
	return {
		OR: [{ status: { in: [...REVENUE_ORDER_STATUSES] } }, { paymentStatus: 'paid' }]
	};
}

export function buildRevenueOrderWindowWhere(gte: Date, lte?: Date): Prisma.OrderWhereInput {
	const paidWindow = buildDateWindow(gte, lte);
	const fallbackCreatedWindow = buildDateWindow(gte, lte);

	return {
		AND: [
			buildRevenueOrderWhere(),
			{
				OR: [
					{ paidAt: paidWindow },
					{
						paidAt: null,
						createdAt: fallbackCreatedWindow
					}
				]
			}
		]
	};
}

export function buildRevenueOrderItemWhere(gte?: Date, lte?: Date): Prisma.OrderItemWhereInput {
	if (!gte) {
		return {
			order: buildRevenueOrderWhere()
		};
	}

	return {
		order: buildRevenueOrderWindowWhere(gte, lte)
	};
}
