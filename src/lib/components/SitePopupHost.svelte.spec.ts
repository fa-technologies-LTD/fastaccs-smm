import { page as browser } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import SitePopupHost from './SitePopupHost.svelte';

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
	page.url.href = 'http://localhost/admin/analytics';
	sessionStorage.removeItem('fastaccs_site_popup_checked');
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ popup }))
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
	expect(fetch).toHaveBeenCalledOnce();
	page.url.pathname = '/admin';
	await expect.element(browser.getByRole('dialog')).not.toBeInTheDocument();
	expect(fetch).toHaveBeenCalledOnce();
});
it('ignores a late storefront popup response after navigation into admin', async () => {
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
