import type { NumbersAnalytics } from '$lib/services/phone-analytics';

/** Server-side redaction: per-order amounts are separate from company revenue/cost access. */
export function numbersAnalyticsForAdmin(
	analytics: NumbersAnalytics,
	revenueVisible: boolean,
	orderAmountsVisible: boolean
) {
	const money = <T extends { revenueNgn: number; costNgn: number; marginNgn: number }>(row: T) => ({
		...row,
		revenueNgn: revenueVisible ? row.revenueNgn : null,
		costNgn: revenueVisible ? row.costNgn : null,
		marginNgn: revenueVisible ? row.marginNgn : null
	});
	return {
		...analytics,
		overall: money(analytics.overall),
		byService: analytics.byService.map(money),
		recent: analytics.recent.map((row) => ({
			...row,
			saleNgn: orderAmountsVisible ? row.saleNgn : null,
			costUsd: revenueVisible ? row.costUsd : null
		}))
	};
}
