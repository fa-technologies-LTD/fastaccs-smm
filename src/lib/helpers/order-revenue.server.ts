import type { Prisma } from '@prisma/client';
import { REVENUE_ORDER_STATUSES, REFUNDED_MARKER } from './order-revenue';

// Orders an owner admin releases to a profile (self-offload of specific logs)
// carry this payment channel so they are excluded from ALL revenue/analytics —
// they are fulfilled but were never a real sale.
export const MANUAL_RELEASE_CHANNEL = 'manual_release';

function buildDateWindow(gte: Date, lte?: Date): { gte: Date; lte?: Date } {
	return lte ? { gte, lte } : { gte };
}

// Cash revenue = order value MINUS store credit applied. Store credit (refunds,
// affiliate earnings, gifts) is not new cash, so it must not count as revenue.
// Callers add `storeCreditApplied: true` alongside `totalAmount: true` in the
// aggregate's `_sum`. All legacy orders have storeCreditApplied = 0, so this is a
// no-op on historical data and only affects credit-paid orders going forward.
export function toCashRevenue(totalAmount: unknown, storeCreditApplied: unknown): number {
	return Number(totalAmount || 0) - Number(storeCreditApplied || 0);
}

export function buildRevenueOrderWhere(): Prisma.OrderWhereInput {
	return {
		AND: [
			{ OR: [{ status: { in: [...REVENUE_ORDER_STATUSES] } }, { paymentStatus: 'paid' }] },
			// Refunded money is never revenue. Mirrors isRevenueOrder() so the SQL aggregates and
			// the in-memory predicate can never disagree. All three columns are NOT NULL with
			// defaults, so `not` here cannot silently drop rows the way it would on a nullable one.
			{ status: { not: REFUNDED_MARKER } },
			{ paymentStatus: { not: REFUNDED_MARKER } },
			{ deliveryStatus: { not: REFUNDED_MARKER } },
			// Exclude owner self-offloads (manual_release) but KEEP orders with a NULL
			// paymentChannel — `NOT: { paymentChannel: 'x' }` drops NULLs in SQL, which
			// was silently excluding legitimate revenue.
			{ OR: [{ paymentChannel: null }, { paymentChannel: { not: MANUAL_RELEASE_CHANNEL } }] }
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
