import type { Prisma } from '@prisma/client';
import { REVENUE_ORDER_STATUSES } from './order-revenue';

// Orders an owner admin releases to a profile (self-offload of specific logs)
// carry this payment channel so they are excluded from ALL revenue/analytics —
// they are fulfilled but were never a real sale.
export const MANUAL_RELEASE_CHANNEL = 'manual_release';

function buildDateWindow(gte: Date, lte?: Date): { gte: Date; lte?: Date } {
	return lte ? { gte, lte } : { gte };
}

export function buildRevenueOrderWhere(): Prisma.OrderWhereInput {
	return {
		AND: [
			{ OR: [{ status: { in: [...REVENUE_ORDER_STATUSES] } }, { paymentStatus: 'paid' }] },
			{ NOT: { paymentChannel: MANUAL_RELEASE_CHANNEL } }
		]
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
