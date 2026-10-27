import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Layout from './+layout.svelte';
vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn(),
	invalidateAll: vi.fn()
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/admin/numbers/analytics') }
}));
const data = {
	user: { email: 'admin@example.test' },
	adminPermissions: ['admin:catalog:manage', 'admin:revenue:view'],
	adminRole: 'FULL_ADMIN'
};
const children = createRawSnippet(() => ({ render: () => '<p>Local admin test</p>' }));
afterEach(() => vi.unstubAllGlobals());
it('provides named mobile navigation, Escape close, focus restoration and background scroll protection', async () => {
	await page.viewport(390, 844);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({}))
	);
	render(Layout, { data, children } as never);
	const open = page.getByRole('button', { name: 'Open admin navigation' });
	await open.click();
	const dialog = page.getByRole('dialog', { name: 'Admin navigation' });
	await expect.element(dialog).toBeVisible();
	await expect.element(open).toHaveAttribute('aria-expanded', 'true');
	expect(document.body.style.overflow).toBe('hidden');
	dialog.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await expect.element(dialog).not.toBeInTheDocument();
	await expect.element(open).toHaveAttribute('aria-expanded', 'false');
	await expect.poll(() => document.body.style.overflow).not.toBe('hidden');
	expect(document.activeElement).toBe(open.element());
});
it('highlights only the most specific sidebar destination and closes the mobile panel on desktop resize', async () => {
	await page.viewport(390, 844);
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({}))
	);
	render(Layout, { data, children } as never);
	await page.getByRole('button', { name: 'Open admin navigation' }).click();
	const panel = page.getByRole('dialog', { name: 'Admin navigation' });
	await expect
		.element(panel.getByRole('link', { name: 'Analytics' }))
		.toHaveAttribute('aria-current', 'page');
	await expect
		.element(panel.getByRole('link', { name: 'Pricing' }))
		.not.toHaveAttribute('aria-current');
	await page.viewport(1360, 900);
	await expect.element(panel).not.toBeInTheDocument();
	await expect.poll(() => document.body.style.overflow).not.toBe('hidden');
});

it('shows the section switcher with the current page marked, and only pages this role can open', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({}))
	);
	render(Layout, { data, children } as never);
	const tabs = page.getByRole('navigation', { name: 'Analytics pages' });
	await expect
		.element(tabs.getByRole('link', { name: 'Numbers Sales' }))
		.toHaveAttribute('aria-current', 'page');
	await expect
		.element(tabs.getByRole('link', { name: 'Boosting Sales' }))
		.toHaveAttribute('href', '/admin/analytics?tab=boosting');
	expect(page.getByRole('link', { name: 'Inventory' }).query()).toBeNull();
});
