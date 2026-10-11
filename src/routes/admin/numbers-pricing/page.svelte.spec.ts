import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';
import { numbersFixture } from '$lib/helpers/numbers-pricing-sheet-fixtures';

beforeEach(async () => {
	await page.viewport(1360, 900);
	document.body.style.padding = '24px';
	document.body.style.background = 'var(--bg)';
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
const price = () =>
	page.getByRole('spinbutton', { name: 'Selling price for WhatsApp · United States' });
it('requires draft saving and a separate publication confirmation', async () => {
	const v = numbersFixture(1);
	v.sheet.rows[0].mode = 'manual';
	v.sheet.rows[0].sale = 2500;
	const fetch = vi.fn(async () => Response.json({ success: true, data: v }));
	vi.stubGlobal('fetch', fetch);
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await price().fill('2500');
	await expect.element(page.getByRole('button', { name: 'Publish prices' })).toBeDisabled();
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect.poll(() => fetch.mock.calls.length).toBe(1);
	expect(
		JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).action
	).toBe('save');
	await page.getByRole('button', { name: 'Publish prices' }).click();
	expect(fetch).toHaveBeenCalledTimes(1);
	await expect.element(page.getByRole('region', { name: 'Confirm publication' })).toBeVisible();
	await page.getByRole('button', { name: 'Yes, publish' }).click();
	await expect.poll(() => fetch.mock.calls.length).toBe(2);
	expect(
		JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
	).toMatchObject({ action: 'publish', version: 1, confirm: true });
});
it('editing a sale switches to manual and updates estimated profit', async () => {
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await price().fill('2500');
	await expect
		.element(page.getByRole('combobox', { name: 'Price mode for WhatsApp · United States' }))
		.toHaveValue('manual');
	await expect.element(page.getByText('Unsaved changes')).toBeVisible();
	await expect.poll(() => document.querySelector('.profit')?.textContent).toContain('₦1,750');
});
it('switching back to Auto shows the actual current live price, not an abandoned typed price', async () => {
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await price().fill('2500');
	await page
		.getByRole('combobox', { name: 'Price mode for WhatsApp · United States' })
		.selectOptions('auto');
	await expect.element(price()).toHaveValue(2000);
	await expect.poll(() => document.querySelector('.profit')?.textContent).toContain('₦1,250');
});
it('target calculation creates a manual, cost-based price', async () => {
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await page
		.getByRole('spinbutton', { name: 'Target profit for WhatsApp · United States' })
		.fill('150');
	await page.getByRole('button', { name: 'Use target' }).click();
	await expect.element(price()).toHaveValue(1900);
	await expect
		.element(page.getByRole('combobox', { name: 'Price mode for WhatsApp · United States' }))
		.toHaveValue('manual');
});
it('refresh is read-only and retains unsaved edits', async () => {
	const v = numbersFixture();
	v.quotes.number.costCents = 60;
	const fetch = vi.fn(async () => Response.json({ success: true, data: v }));
	vi.stubGlobal('fetch', fetch);
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await price().fill('2600');
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect.element(price()).toHaveValue(2600);
	expect(fetch).toHaveBeenCalledWith('/api/admin/numbers-pricing');
	await expect.poll(() => document.querySelector('.profit')?.textContent).toContain('₦1,700');
});
it('exports unsaved prices rather than stale saved prices', async () => {
	const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	render(Page, { data: { pricing: numbersFixture() } } as never);
	await price().fill('2600');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const csv = await (create.mock.calls[0][0] as Blob).text();
	expect(csv).toContain('"2600"');
	expect(csv).toContain('WhatsApp');
});
it('fits mobile and desktop with sheet scrolling contained', async () => {
	render(Page, { data: { pricing: numbersFixture() } } as never);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1360);
	await page.screenshot({ path: 'src/routes/admin/numbers-pricing/__screenshots__/desktop.png' });
	await page.viewport(390, 844);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	await page.screenshot({ path: 'src/routes/admin/numbers-pricing/__screenshots__/mobile.png' });
});
it('limits table rendering to 100 rows while search and export cover the whole sheet', async () => {
	const v = numbersFixture();
	const original = structuredClone(v.sheet.rows[0]),
		q = structuredClone(v.quotes.number);
	for (let i = 1; i < 205; i++) {
		v.sheet.rows.push({ ...structuredClone(original), id: `number${i}` });
		v.quotes[`number${i}`] = { ...structuredClone(q), country: `Country ${i}` };
	}
	render(Page, { data: { pricing: v } } as never);
	expect(document.querySelectorAll('tbody tr')).toHaveLength(100);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect.element(page.getByText('Page 2 of 3')).toBeVisible();
	await page.getByRole('textbox', { name: 'Search Numbers' }).fill('Country 204');
	expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
	await expect.element(page.getByText('Country 204', { exact: true })).toBeVisible();
});
