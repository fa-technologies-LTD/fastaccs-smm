import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import BoostingSalesReport from './BoostingSalesReport.svelte';

const report = {
	since: '2026-09-11T12:00:00Z',
	checkedAt: '2026-10-11T12:00:00Z',
	overall: {
		orders: 45,
		items: 53,
		completed: 53,
		knownCostItems: 1,
		completionRate: 100,
		netSalesNgn: 7500,
		supplierCostNgn: 100,
		recordedMarginNgn: 400
	},
	byService: [],
	providers: []
};
afterEach(() => vi.unstubAllGlobals());

it('loads the report itself and makes incomplete cost coverage explicit', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: report }))
	);
	render(BoostingSalesReport, { canViewRevenue: true });
	await expect.element(page.getByText('45', { exact: true })).toBeVisible();
	await page.getByText('By service · last 30 days', { exact: true }).click();
	await expect.element(page.getByText(/Costs recorded for 1 of 53 items/)).toBeVisible();
	await expect.element(page.getByText(/Unknown costs aren’t treated as free/)).toBeVisible();
	expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/admin/boosting-orders/analytics');
});

it('explains payment fees even when supplier cost coverage is complete', async () => {
	render(BoostingSalesReport, {
		canViewRevenue: true,
		initial: { ...report, overall: { ...report.overall, knownCostItems: 53 } } as never
	});
	await expect
		.element(
			page.getByText(
				'Recorded margin is after refunds and known supplier charges, before payment fees. It is not final profit.'
			)
		)
		.toBeVisible();
	expect(page.getByText(/Costs recorded for/).query()).toBeNull();
});

it('keeps the last report when a refresh fails, never fake zeros', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: false }, { status: 503 }))
	);
	render(BoostingSalesReport, { canViewRevenue: true, initial: report as never });
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect
		.element(page.getByText('Could not refresh the report. Showing the last one that loaded.'))
		.toBeVisible();
	await expect.element(page.getByText('45', { exact: true })).toBeVisible();
});

it('hides money for roles that cannot see revenue', async () => {
	render(BoostingSalesReport, { canViewRevenue: false, initial: report as never });
	await expect.element(page.getByText('Boosting items', { exact: true })).toBeVisible();
	expect(page.getByText('Net sales', { exact: true }).query()).toBeNull();
	expect(page.getByText('Recorded margin', { exact: true }).query()).toBeNull();
});
