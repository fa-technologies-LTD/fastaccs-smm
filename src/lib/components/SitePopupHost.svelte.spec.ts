import { page as browser, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import SitePopupHost from './SitePopupHost.svelte';
import { markBoostingLaunchNoticeSeen } from '$lib/helpers/boosting-launch-notice';
import { cart } from '$lib/stores/cart.svelte';

const launchState = vi.hoisted(() => ({ seen: false }));
vi.mock('$lib/helpers/boosting-launch-notice', async (original) => ({
	...(await original<typeof import('$lib/helpers/boosting-launch-notice')>()),
	hasSeenBoostingLaunchNotice: () => launchState.seen,
	markBoostingLaunchNoticeSeen: vi.fn(() => {
		launchState.seen = true;
	})
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', async () => {
	const { SvelteURL } = await import('svelte/reactivity');
	return { page: { url: new SvelteURL('http://localhost/admin/analytics') } };
});
const popup = {
	type: 'welcome',
	icon: '🎉',
	title: 'Test customer announcement',
	body: 'Customer announcement only.',
	ctaText: 'Close'
};
beforeEach(() => {
	launchState.seen = false;
	vi.clearAllMocks();
	page.url.href = 'http://localhost/admin/analytics';
	sessionStorage.removeItem('fastaccs_site_popup_checked');
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url) =>
			Response.json(
				url === '/api/boosting-offers'
					? { automationReady: false, managedRolloutActive: true, data: [] }
					: { popup }
			)
		)
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	sessionStorage.removeItem('fastaccs_site_popup_checked');
});

it('never fetches or renders customer popups in admin', async () => {
	render(SitePopupHost, { isLoggedIn: true });
	await tick();
	expect(fetch).not.toHaveBeenCalled();
	expect(browser.getByRole('dialog').query()).toBeNull();
	expect(sessionStorage.getItem('fastaccs_site_popup_checked')).toBeNull();
});
it('retains customer popups and hides them upon entering admin without marking them seen', async () => {
	page.url.pathname = '/dashboard';
	render(SitePopupHost, { isLoggedIn: true });
	await expect.element(browser.getByRole('dialog')).toBeVisible();
	expect(fetch).toHaveBeenCalledTimes(2);
	page.url.pathname = '/admin';
	await expect.element(browser.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetch).toHaveBeenCalledTimes(2);
});
it('ignores a late storefront popup response after navigation into admin', async () => {
	launchState.seen = true;
	let resolvePopup!: (response: Response) => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolvePopup = resolve;
				})
		)
	);
	page.url.pathname = '/dashboard';
	render(SitePopupHost, { isLoggedIn: true });
	await tick();
	expect(fetch).toHaveBeenCalledOnce();
	page.url.pathname = '/admin/orders';
	await tick();
	resolvePopup(Response.json({ popup }));
	await tick();
	await tick();
	expect(browser.getByRole('dialog').query()).toBeNull();
});

it('shows guests one reopening notice, marks the impression and does not repeat after remount', async () => {
	page.url.pathname = '/';
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			Response.json({
				automationReady: true,
				managedRolloutActive: true,
				data: [{ id: 'available' }]
			})
		)
	);
	const first = render(SitePopupHost, { isLoggedIn: false });
	await expect.element(browser.getByRole('dialog', { name: 'Boosting is back.' })).toBeVisible();
	expect(markBoostingLaunchNoticeSeen).toHaveBeenCalledOnce();
	await expect
		.element(browser.getByRole('link', { name: 'View services' }))
		.toHaveAttribute('href', '/services');
	await expect
		.element(browser.getByText('Pick a service. Place your order. Track it here.', { exact: true }))
		.toBeVisible();
	expect(browser.getByText('BACK ON FASTACCS', { exact: true }).query()).toBeNull();
	expect(browser.getByText(/Explore the available services/).query()).toBeNull();
	await browser.getByRole('button', { name: 'Close announcement' }).click();
	await expect.element(browser.getByRole('dialog')).not.toBeInTheDocument();
	await first.unmount();
	render(SitePopupHost, { isLoggedIn: false });
	await tick();
	expect(fetch).toHaveBeenCalledOnce();
	expect(browser.getByRole('dialog').query()).toBeNull();
});

it('does not stack another announcement for signed-in customers and supports Escape', async () => {
	page.url.pathname = '/dashboard';
	// A previous announcement check in this visit must not consume this revised notice.
	sessionStorage.setItem('fastaccs_site_popup_checked', '1');
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			Response.json({
				automationReady: true,
				managedRolloutActive: true,
				data: [{ id: 'available' }]
			})
		)
	);
	render(SitePopupHost, { isLoggedIn: true });
	await expect.element(browser.getByRole('dialog', { name: 'Boosting is back.' })).toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(browser.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetch).toHaveBeenCalledOnce();
});

it.each(['/checkout', '/order/paid', '/admin/boosting-pricing', '/login', '/numbers/order/test'])(
	'never interrupts the sensitive route %s',
	async (path) => {
		page.url.href = `http://localhost${path}`;
		render(SitePopupHost, { isLoggedIn: true });
		await tick();
		expect(fetch).not.toHaveBeenCalled();
		expect(markBoostingLaunchNoticeSeen).not.toHaveBeenCalled();
	}
);

it('does not announce unavailable services or consume the announcement impression', async () => {
	page.url.pathname = '/services';
	render(SitePopupHost, { isLoggedIn: false });
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
	await tick();
	expect(markBoostingLaunchNoticeSeen).not.toHaveBeenCalled();
	expect(browser.getByRole('dialog').query()).toBeNull();
});

it('ignores an availability response arriving after navigation to checkout', async () => {
	let resolveAvailability!: (response: Response) => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveAvailability = resolve;
				})
		)
	);
	page.url.pathname = '/';
	render(SitePopupHost, { isLoggedIn: false });
	await tick();
	page.url.pathname = '/checkout';
	await tick();
	resolveAvailability(
		Response.json({
			automationReady: true,
			managedRolloutActive: true,
			data: [{ id: 'available' }]
		})
	);
	await tick();
	await tick();
	expect(markBoostingLaunchNoticeSeen).not.toHaveBeenCalled();
	expect(browser.getByRole('dialog').query()).toBeNull();
});

it('stays quiet while the buyer has items in the cart', async () => {
	page.url.pathname = '/dashboard';
	cart.addTier('fixture-account', 1);
	render(SitePopupHost, { isLoggedIn: true });
	await tick();
	await tick();
	expect(browser.getByRole('dialog').query()).toBeNull();
	expect(fetch).not.toHaveBeenCalled();
	cart.clear();
});
