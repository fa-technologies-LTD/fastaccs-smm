import { page as browser } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import { pushState } from '$app/navigation';
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
	vi.mocked(pushState).mockImplementation((_url, state) => {
		mock.setState(state);
	});
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

it('shows five readable sections and sends product links to their actual reports', async () => {
	render(Page, { data: fixture() } as never);
	const nav = browser.getByRole('navigation', { name: 'Analytics sections' });
	for (const name of ['Overview', 'Accounts', 'Boosting', 'Numbers', 'Users'])
		await expect.element(nav.getByRole('link', { name, exact: true })).toBeVisible();
	await expect
		.element(nav.getByRole('link', { name: 'Accounts', exact: true }))
		.toHaveAttribute('aria-current', 'page');
	await expect
		.element(nav.getByRole('link', { name: 'Users', exact: true }))
		.toHaveAttribute('data-sveltekit-preload-data', 'off');
	await expect
		.element(nav.getByRole('link', { name: 'Boosting', exact: true }))
		.toHaveAttribute('href', '/admin/boosting-orders');
	await expect
		.element(nav.getByRole('link', { name: 'Numbers', exact: true }))
		.toHaveAttribute('href', '/admin/numbers/analytics');
	await expect.element(browser.getByText('42', { exact: true })).toBeVisible();
	await expect.element(browser.getByText('₦45,600', { exact: true })).toBeVisible();
	expect(browser.getByText('₦123,450', { exact: true }).query()).toBeNull();
});
it('switches hub sections without fetching and supports a restored URL', async () => {
	render(Page, { data: fixture() } as never);
	const nav = browser.getByRole('navigation', { name: 'Analytics sections' });
	await nav.getByRole('link', { name: 'Users', exact: true }).click();
	await expect
		.element(browser.getByText('User analytics are unavailable right now.'))
		.toBeVisible();
	expect(pushState).toHaveBeenCalledOnce();
	expect(page.url.searchParams.get('tab')).toBe('accounts');
	expect(fetch).not.toHaveBeenCalled();
	mock.setState({});
	page.url.href = 'http://localhost/admin/analytics?tab=accounts';
	await expect.element(browser.getByRole('region', { name: 'Accounts analytics' })).toBeVisible();
	expect(fetch).not.toHaveBeenCalled();
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
it('keeps every section visible on a narrow viewport', async () => {
	await browser.viewport(390, 844);
	render(Page, { data: fixture() } as never);
	for (const name of ['Overview', 'Accounts', 'Boosting', 'Numbers', 'Users'])
		await expect.element(browser.getByRole('link', { name, exact: true })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
