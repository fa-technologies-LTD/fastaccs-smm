import { page as browser } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import '$lib/../app.css';
import Page from './+page.svelte';

const mock = vi.hoisted(() => ({ setState: (_value: object) => {} }));

vi.mock('$app/state', async () => {
	const { SvelteURL, SvelteMap } = await import('svelte/reactivity');
	const state = new SvelteMap<string, object>([['value', {}]]);
	mock.setState = (value) => {
		state.set('value', value);
	};
	return {
		page: {
			url: new SvelteURL('http://localhost/admin/analytics?tab=accounts'),
			get state() {
				return state.get('value');
			}
		}
	};
});
vi.mock('$app/navigation', () => ({ pushState: vi.fn() }));
const permissions = ['admin:access', 'admin:catalog:manage', 'admin:revenue:view'];
const fixture = () => ({
	canViewRevenue: true,
	adminPermissions: permissions,
	stats: {
		totalAccounts: 100,
		accountsSold: 42,
		availableAccounts: 58,
		totalRevenue: 123450,
		accountSales: { totalRevenue: 45600, totalOrders: 42 },
		revenueBreakdown: { byPlatform: [] }
	}
});
beforeEach(async () => {
	await browser.viewport(1360, 900);
	page.url.href = 'http://localhost/admin/analytics?tab=accounts';
	mock.setState({});
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('Tabs must reuse loaded data');
		})
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('opens the tab named in the link and shows account sales without fetching', async () => {
	render(Page, { data: fixture() } as never);
	await expect.element(browser.getByText('42', { exact: true })).toBeVisible();
	await expect.element(browser.getByText('₦45,600', { exact: true })).toBeVisible();
	expect(browser.getByText('₦123,450', { exact: true }).query()).toBeNull();
	expect(fetch).not.toHaveBeenCalled();
});
it('switches tabs from the link without reloading the reports', async () => {
	render(Page, { data: fixture() } as never);
	page.url.href = 'http://localhost/admin/analytics?tab=users';
	await expect
		.element(browser.getByText('User analytics are unavailable right now.'))
		.toBeVisible();
	page.url.href = 'http://localhost/admin/analytics?tab=accounts';
	await expect.element(browser.getByRole('region', { name: 'Accounts analytics' })).toBeVisible();
	expect(fetch).not.toHaveBeenCalled();
});
it('shows Boosting Sales as a real report on its own tab', async () => {
	page.url.href = 'http://localhost/admin/analytics?tab=boosting';
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			Response.json({
				success: true,
				data: {
					overall: {
						orders: 7,
						items: 9,
						completed: 9,
						knownCostItems: 9,
						completionRate: 100,
						netSalesNgn: 9000,
						supplierCostNgn: 3000,
						recordedMarginNgn: 6000
					},
					byService: [],
					providers: []
				}
			})
		)
	);
	render(Page, { data: fixture() } as never);
	await expect
		.element(browser.getByRole('heading', { name: 'Boosting Sales', exact: true }))
		.toBeVisible();
	await expect.element(browser.getByText('Paid orders', { exact: true })).toBeVisible();
	expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/admin/boosting-orders/analytics');
});
it('does not expose revenue or owner-only destinations to a restricted role', async () => {
	render(Page, {
		data: { ...fixture(), canViewRevenue: false, adminPermissions: ['admin:access'] }
	} as never);
	expect(browser.getByText('Lifetime net sales', { exact: true }).query()).toBeNull();
	expect(browser.getByText('₦123,450', { exact: true }).query()).toBeNull();
	expect(browser.getByRole('link', { name: 'Overview', exact: true }).query()).toBeNull();
	await expect.element(browser.getByText('42', { exact: true })).toBeVisible();
});
it('distinguishes missing analytics from zero sales', async () => {
	render(Page, { data: { ...fixture(), stats: {} } } as never);
	await expect
		.element(browser.getByRole('status'))
		.toHaveTextContent('Account analytics are unavailable right now.');
	expect(browser.getByText('0', { exact: true }).query()).toBeNull();
});
it('fits a narrow viewport without sideways scrolling', async () => {
	await browser.viewport(390, 844);
	render(Page, { data: fixture() } as never);
	await expect.element(browser.getByRole('region', { name: 'Accounts analytics' })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
