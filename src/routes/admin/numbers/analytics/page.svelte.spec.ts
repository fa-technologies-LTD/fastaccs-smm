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

it('hides company money while preserving an order manager’s per-order refund amounts', async () => {
	render(Page, { data: fixture(false) } as never);
	await expect
		.element(page.getByText('Revenue and supplier costs are hidden for your role.'))
		.toBeVisible();
	await expect.element(page.getByText('₦5,500', { exact: true })).toBeVisible();
	expect(page.getByText('₦11,000', { exact: true }).query()).toBeNull();
	expect(page.getByText('$0.75', { exact: true }).query()).toBeNull();
	expect(page.getByText('$8.02', { exact: true }).query()).toBeNull();
	expect(page.getByRole('link', { name: 'Overview', exact: true }).query()).toBeNull();
	await expect
		.element(page.getByRole('link', { name: 'Numbers', exact: true }))
		.toHaveAttribute('aria-current', 'page');
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
	await expect
		.element(page.getByRole('link', { name: 'Overview', exact: true }))
		.toHaveAttribute('href', '/admin/analytics');
});

it('shows the full provider-attempt trail behind the final source', async () => {
	render(Page, { data: fixture(true) } as never);
	await page.getByText('2 attempts', { exact: true }).click();
	await expect.element(page.getByText(/Whatsapp24/)).toBeVisible();
	await expect.element(page.getByText(/otp timeout/)).toBeVisible();
	await expect.element(page.getByText(/Hubman/)).toBeVisible();
	await expect.element(page.getByText(/otp received/)).toBeVisible();
});
