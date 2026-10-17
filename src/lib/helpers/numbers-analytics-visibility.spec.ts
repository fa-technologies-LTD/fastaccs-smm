import { expect, it } from 'vitest';
import { numbersAnalyticsForAdmin } from './numbers-analytics-visibility';
import { numbersAnalyticsFixture } from './numbers-analytics-fixtures';

it('redacts aggregate revenue, costs and margins without pretending they are zero', () => {
	const source = numbersAnalyticsFixture();
	const view = numbersAnalyticsForAdmin(source, false, false);
	expect(view.overall).toMatchObject({
		total: 3,
		successRatePct: 67,
		revenueNgn: null,
		costNgn: null,
		marginNgn: null
	});
	expect(view.byService[0]).toMatchObject({ revenueNgn: null, costNgn: null, marginNgn: null });
	expect(view.recent[0]).toMatchObject({ saleNgn: null, costUsd: null });
	expect(source.overall.revenueNgn).toBe(11000);
	expect(source.recent[0].costUsd).toBe(0.75);
});
it('separates per-order amount access from company revenue and supplier cost access', () => {
	const view = numbersAnalyticsForAdmin(numbersAnalyticsFixture(), false, true);
	expect(view.recent[0]).toMatchObject({ saleNgn: 5500, costUsd: null });
	expect(view.overall.marginNgn).toBeNull();
});
it('preserves the full report for a fully authorised owner', () => {
	const source = numbersAnalyticsFixture();
	expect(numbersAnalyticsForAdmin(source, true, true)).toEqual(source);
});
