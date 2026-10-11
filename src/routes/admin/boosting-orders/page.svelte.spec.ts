import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';

const meta = {
	page: 1,
	pageSize: 25,
	total: 0,
	totalPages: 1,
	sort: 'newest',
	status: 'active',
	search: '',
	activeCount: 0,
	totalItems: 53,
	statusCounts: { completed: 53 },
	canRunShadowRouting: false
};
const analytics = {
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
const fixture = () => ({
	items: [],
	meta,
	stats: { total_orders: 45 },
	error: null,
	analyticsError: null,
	analytics,
	canViewRevenue: true
});
beforeEach(async () => {
	await page.viewport(1360, 900);
	document.body.style.padding = '24px';
	document.body.style.background = 'var(--bg)';
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: [], meta }))
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('uses the same item unit for all status counts, even when orders contain multiple items', async () => {
	render(Page, { data: fixture() } as never);
	await expect.element(page.getByRole('button', { name: 'All 53', exact: true })).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Completed 53', exact: true }))
		.toBeVisible();
	expect(page.getByRole('button', { name: 'All 45', exact: true }).query()).toBeNull();
	await page.screenshot({ path: '__screenshots__/desktop.png' });
	await page.getByRole('button', { name: 'All 53', exact: true }).click();
	await expect.poll(() => vi.mocked(fetch).mock.calls.length).toBe(1);
	expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('status=all');
});
it('makes incomplete cost coverage explicit instead of calling unknown costs free', async () => {
	render(Page, { data: fixture() } as never);
	await page.getByText('By service · last 30 days', { exact: true }).click();
	await expect.element(page.getByText(/Costs recorded for 1 of 53 items/)).toBeVisible();
	await expect.element(page.getByText(/Unknown costs aren’t treated as free/)).toBeVisible();
});
it('refreshes analytics and the order queue together from their real endpoint contracts', async () => {
	const fresh = structuredClone(analytics);
	fresh.overall.orders = 46;
	fresh.overall.items = 54;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			Response.json(
				String(input).endsWith('/analytics')
					? { success: true, data: fresh }
					: { success: true, data: [], meta: { ...meta, totalItems: 54 } }
			)
		)
	);
	render(Page, { data: fixture() } as never);
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect.element(page.getByText('46', { exact: true })).toBeVisible();
	await expect.element(page.getByRole('button', { name: 'All 54', exact: true })).toBeVisible();
	expect(fetch).toHaveBeenCalledTimes(2);
});
it('labels cached reporting when analytics fails without replacing it with fake zero figures', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).endsWith('/analytics')
				? Response.json({ success: false }, { status: 503 })
				: Response.json({ success: true, data: [], meta })
		)
	);
	render(Page, { data: fixture() } as never);
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect
		.element(
			page.getByText('Could not refresh analytics. Showing the last successful report.', {
				exact: true
			})
		)
		.toBeVisible();
	await expect.element(page.getByText('45', { exact: true })).toBeVisible();
});
it('shows purchased refill protection and supplier progress without manual completion controls', async () => {
	const data = fixture();
	(data.items as unknown[]) = [
		{
			id: 'item',
			productName: 'Instagram Followers',
			boostTargetUrl: 'https://instagram.com/example',
			boostQuantity: 1000,
			boostFulfillmentStatus: 'in_progress',
			boostProviderReference: null,
			createdAt: '2026-10-11T12:00:00Z',
			complaints: [],
			latestIssue: null,
			shadowDecision: null,
			fulfillmentState: { status: 'submitted', mode: 'live' },
			progress: {
				rawProviderStatus: 'In progress',
				remains: 800,
				startCount: null,
				supplierOrderId: '123',
				lastCheckedAt: null,
				refillDays: 7
			},
			category: { metadata: { boosting_refill_available: true, boosting_refill_days: 30 } },
			order: {
				id: 'order',
				orderNumber: 'FA-TEST',
				createdAt: '2026-10-11T12:00:00Z',
				paidAt: null,
				user: null,
				guestEmail: 'buyer@example.com'
			}
		}
	];
	render(Page, { data } as never);
	await expect.element(page.getByText('7-day refill', { exact: true })).toBeVisible();
	await expect.element(page.getByText(/200 \/ 1,000 supplier-reported/)).toBeVisible();
	expect(page.getByRole('button', { name: 'Complete', exact: true }).query()).toBeNull();
	expect(page.getByText('30-day refill', { exact: true }).query()).toBeNull();
});
it('does not render revenue cards for restricted admins', async () => {
	render(Page, { data: { ...fixture(), canViewRevenue: false } } as never);
	expect(page.getByText('Net sales', { exact: true }).query()).toBeNull();
	expect(page.getByText('Recorded margin', { exact: true }).query()).toBeNull();
	await expect.element(page.getByText('Boosting items', { exact: true })).toBeVisible();
});
it('fits a mobile viewport without horizontal page scrolling', async () => {
	await page.viewport(390, 844);
	render(Page, { data: fixture() } as never);
	await expect
		.element(page.getByRole('heading', { name: 'Boosting — Orders & Analytics' }))
		.toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	await page.screenshot({ path: '__screenshots__/mobile.png' });
});
