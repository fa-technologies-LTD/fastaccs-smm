import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import '$lib/../app.css';
import { numbersAnalyticsFixture } from '$lib/helpers/numbers-analytics-fixtures';
import { numbersAnalyticsForAdmin } from '$lib/helpers/numbers-analytics-visibility';
import Page from './+page.svelte';

function fixture(revenueVisible: boolean) {
	return {
		analytics: numbersAnalyticsForAdmin(numbersAnalyticsFixture(), revenueVisible, true),
		canViewRevenue: revenueVisible,
		canViewOrderAmounts: true,
		adminPermissions: revenueVisible
			? ['admin:access', 'admin:catalog:manage', 'admin:revenue:view']
			: ['admin:access', 'admin:catalog:manage'],
		hubBalanceCents: revenueVisible ? 802 : null,
		pvapinsBalanceCents: revenueVisible ? 1852 : null,
		lowBalanceThresholdCents: 200,
		probeSummary: null
	};
}

it('hides company money for roles without revenue access', async () => {
	render(Page, { data: fixture(false) } as never);
	await expect
		.element(page.getByText('Revenue and supplier costs are hidden for your role.'))
		.toBeVisible();
	expect(page.getByText('₦11,000', { exact: true }).query()).toBeNull();
	expect(page.getByText('$0.75', { exact: true }).query()).toBeNull();
	expect(page.getByText('$8.02', { exact: true }).query()).toBeNull();
});
it('labels current-rate margin as estimated, not final profit', async () => {
	render(Page, { data: fixture(true) } as never);
	await expect
		.element(page.getByText(/Margin is estimated at your current dollar rate, before payment fees/))
		.toBeVisible();
	const marginHeader = Array.from(document.querySelectorAll('th')).find(
		(header) => header.textContent?.trim() === 'Estimated margin'
	);
	expect(marginHeader).toBeTruthy();
	expect(marginHeader?.getAttribute('scope')).toBe('col');
	await expect.element(page.getByText('$8.02', { exact: true })).toBeVisible();
});
it('points to Numbers Orders for each order and its supplier attempts', async () => {
	render(Page, { data: fixture(true) } as never);
	await expect
		.element(page.getByRole('link', { name: 'Numbers Orders', exact: true }))
		.toHaveAttribute('href', '/admin/numbers/orders');
});
