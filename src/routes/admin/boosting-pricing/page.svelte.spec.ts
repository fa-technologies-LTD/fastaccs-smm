import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';
import { sheet, quote } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostControlsView } from '$lib/helpers/boosting-pricing-controls';
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
function fixture(): BoostControlsView {
	return {
		sheet: {
			...structuredClone(sheet),
			version: 1,
			settings: {
				...sheet.settings,
				defaultMarkup: 40,
				profitTargetNgn: 0,
				hardProfitNgn: 0,
				maxPriceMultiple: 0
			}
		},
		quotes: { row: { ...structuredClone(quote), checkedAt: new Date().toISOString() } },
		liveStatuses: { row: 'live' },
		setup: {
			row: { categoryId: 'category', routingPolicy: 'locked', maximumCostNgn: 20, reviewed: true }
		},
		archivedDraft: false,
		history: [],
		approval: { id: 'approval', approvedAt: '2026-10-10', digest: 'test' }
	};
}
beforeEach(async () => {
	await page.viewport(1360, 900);
	document.body.style.padding = '24px';
	document.body.style.background = 'var(--bg)';
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: { providers: [] } }))
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it('uses one Save and locks edited customer prices', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/discovery'))
			return Response.json({ success: true, data: { providers: [] } });
		const next = fixture();
		next.sheet = JSON.parse(init!.body as string).sheet;
		return Response.json({ success: true, data: next });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await expect
		.element(page.getByRole('button', { name: 'Unlock TikTok Likes value price' }))
		.toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect
		.poll(() => fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length)
		.toBe(1);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({ action: 'save', sheet: { rows: [{ sale: 900 }] } });
	expect(page.getByRole('button', { name: 'Publish menu' }).query()).toBeNull();
});
it('previews automatic prices but preserves manual locks when the dollar rate changes', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(500);
	await page.getByRole('button', { name: 'Unlock TikTok Likes value price' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(150);
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('3000');
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(250);
});
it('requires confirmation before add-only catalogue expansion', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).includes('/discovery') ? { providers: [] } : fixture(),
			summary: { offersCreated: 2 }
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('button', { name: '+ Expand catalogue' }).click();
	await expect.element(page.getByRole('dialog', { name: 'Expand catalogue?' })).toBeVisible();
	expect(fetchMock.mock.calls.length).toBe(1);
	await page.getByRole('button', { name: 'Expand catalogue', exact: true }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
});
it('protects unsaved prices from refresh and supplier setup', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await expect.element(page.getByRole('button', { name: 'Refresh costs' })).toBeDisabled();
	await expect.element(page.getByRole('button', { name: '+ Expand catalogue' })).toBeDisabled();
	await page.getByRole('button', { name: 'SMM Raja' }).click();
	expect(page.getByRole('dialog', { name: 'TikTok Likes · Supplier setup' }).query()).toBeNull();
});
it('exports current edits without saving or publishing them', async () => {
	const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	expect(await (create.mock.calls[0][0] as Blob).text()).toContain('950');
});
it('keeps the catalogue scroll inside the page on mobile', async () => {
	await page.viewport(390, 844);
	render(Page, { data: { pricing: fixture() } } as never);
	await expect.element(page.getByRole('heading', { name: 'Boosting — Pricing' })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	await page.screenshot({ path: 'src/routes/admin/boosting-pricing/__screenshots__/mobile.png' });
});
it('matches the native Numbers-style layout on desktop', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1360);
	await page.screenshot({ path: 'src/routes/admin/boosting-pricing/__screenshots__/desktop.png' });
});
