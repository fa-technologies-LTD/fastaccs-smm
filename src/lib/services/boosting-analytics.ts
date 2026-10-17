import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { boostChargedCostSql } from '$lib/server/boosting-charged-cost';

type Aggregate = {
	categoryId: string | null;
	name: string | null;
	platform: string | null;
	outcome: string | null;
	orders: bigint | number;
	items: bigint | number;
	completed: bigint | number;
	knownCosts: bigint | number;
	netSales: Prisma.Decimal | number;
	supplierCost: Prisma.Decimal | number;
	recordedMargin: Prisma.Decimal | number;
};

export interface BoostingAnalyticsRow {
	categoryId: string | null;
	name: string;
	platform: string;
	outcome: string;
	orders: number;
	items: number;
	completed: number;
	knownCostItems: number;
	completionRate: number | null;
	netSalesNgn: number | null;
	supplierCostNgn: number | null;
	recordedMarginNgn: number | null;
	paymentFeesNgn: null;
	profitAfterPaymentFeesNgn: null;
}

/** Reporting only. Uses historical charged costs + historical FX, never today's quote or price. */
export async function getBoostingAnalytics(
	revenueVisible: boolean,
	database: PrismaClient = prisma,
	now = new Date()
) {
	const since = new Date(now.getTime() - 30 * 86400000);
	const [rows, providers] = await Promise.all([
		database.$queryRaw<Aggregate[]>(Prisma.sql`
			WITH base AS (
				SELECT i.id, i.category_id, c.name,
					COALESCE(f.platform, c.metadata->>'boosting_platform', '') AS platform,
					COALESCE(f.outcome, c.metadata->>'boosting_action_type', '') AS outcome,
					i.order_id, i.boost_fulfillment_status AS status,
					i.total_price, i.refunded_amount AS item_refund,
					SUM(i.total_price) OVER (PARTITION BY i.order_id) AS item_total,
					SUM(i.refunded_amount) OVER (PARTITION BY i.order_id) AS attributed_refund,
					o.total_amount, o.refunded_amount AS order_refund,
					(o.status = 'refunded' OR o.payment_status = 'refunded' OR o.delivery_status = 'refunded') AS full_refund,
					CASE WHEN charges.total_usd IS NOT NULL AND f.fx_ngn_per_usd > 0
						THEN charges.total_usd * f.fx_ngn_per_usd ELSE NULL END AS cost
				FROM order_items i JOIN orders o ON o.id = i.order_id
				JOIN categories c ON c.id = i.category_id
				LEFT JOIN boost_fulfillments f ON f.order_item_id = i.id
				LEFT JOIN LATERAL (${boostChargedCostSql()}) charges ON true
				WHERE o.order_type = 'boosting' AND i.boost_target_url IS NOT NULL
					AND COALESCE(o.paid_at, o.created_at) >= ${since}
					AND COALESCE(o.paid_at, o.created_at) <= ${now}
					AND (o.payment_status IN ('paid', 'success', 'overpaid')
						OR (o.paid_at IS NOT NULL AND (o.payment_status = 'refunded' OR o.status = 'refunded' OR o.delivery_status = 'refunded')))
			), valued AS (
				SELECT *, CASE WHEN full_refund THEN 0 ELSE GREATEST(0,
					(total_amount - GREATEST(0, order_refund - attributed_refund))
					* total_price / NULLIF(item_total, 0) - item_refund) END AS net_price
				FROM base
			)
			SELECT category_id AS "categoryId", name, platform, outcome,
				COUNT(DISTINCT order_id) AS orders, COUNT(*) AS items,
				COUNT(*) FILTER (WHERE status = 'completed') AS completed,
				COUNT(cost) AS "knownCosts", COALESCE(SUM(net_price), 0) AS "netSales",
				COALESCE(SUM(cost), 0) AS "supplierCost",
				COALESCE(SUM(net_price - cost) FILTER (WHERE cost IS NOT NULL), 0) AS "recordedMargin"
			FROM valued GROUP BY GROUPING SETS ((), (category_id, name, platform, outcome))
			ORDER BY COUNT(*) DESC
		`),
		revenueVisible
			? database.boostProviderState.findMany({
					select: {
						provider: true,
						label: true,
						balance: true,
						currency: true,
						enabled: true,
						circuitOpen: true,
						lastBalanceSuccessAt: true
					}
				})
			: Promise.resolve([])
	]);
	const convert = (r: Aggregate): BoostingAnalyticsRow => ({
		categoryId: r.categoryId,
		name: r.name ?? 'All services',
		platform: r.platform ?? '',
		outcome: r.outcome ?? '',
		orders: Number(r.orders),
		items: Number(r.items),
		completed: Number(r.completed),
		knownCostItems: Number(r.knownCosts),
		completionRate: Number(r.items)
			? Math.round((Number(r.completed) / Number(r.items)) * 100)
			: null,
		netSalesNgn: revenueVisible ? Number(r.netSales) : null,
		supplierCostNgn: revenueVisible && Number(r.knownCosts) ? Number(r.supplierCost) : null,
		recordedMarginNgn: revenueVisible && Number(r.knownCosts) ? Number(r.recordedMargin) : null,
		paymentFeesNgn: null,
		profitAfterPaymentFeesNgn: null
	});
	const overall = rows.find((r) => r.categoryId === null) ?? {
		categoryId: null,
		name: null,
		platform: null,
		outcome: null,
		orders: 0,
		items: 0,
		completed: 0,
		knownCosts: 0,
		netSales: 0,
		supplierCost: 0,
		recordedMargin: 0
	};
	return {
		since: since.toISOString(),
		checkedAt: now.toISOString(),
		overall: convert(overall),
		byService: rows.filter((r) => r.categoryId !== null).map(convert),
		providers: providers.map((p) => ({
			...p,
			balance: p.balance === null ? null : Number(p.balance),
			lastBalanceSuccessAt: p.lastBalanceSuccessAt?.toISOString() ?? null
		}))
	};
}
