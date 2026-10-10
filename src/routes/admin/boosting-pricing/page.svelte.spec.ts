import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';
import { sheet, quote } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostPricingView } from '$lib/helpers/boosting-pricing-sheet';

function fixture(version = 1): BoostPricingView {
	return {
		sheet: { ...structuredClone(sheet), version },
		quotes: { row: structuredClone(quote) },
		liveStatuses: { row: 'hidden' },
		history: [],
		approval: { id: 'approval', approvedAt: '2026-10-10T13:43:41Z', digest: 'verified' }
	};
}
beforeEach(async () => {
	await page.viewport(1360, 900);
	document.body.style.padding = '24px';
	document.body.style.background = 'var(--bg)';
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it('saves the initial approved sheet only as a draft and requires a separate publish confirmation', async () => {
	const fetchMock = vi.fn(async () => Response.json({ success: true, data: fixture(1) }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture(0) } } as never);
	await expect.element(page.getByRole('button', { name: 'Publish menu' })).toBeDisabled();
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
	expect(
		JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
			.action
	).toBe('save');
	await page.getByRole('button', { name: 'Publish menu' }).click();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	await expect.element(page.getByRole('region', { name: 'Confirm publication' })).toBeVisible();
	await page.getByRole('button', { name: 'Yes, publish' }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
	expect(
		JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
	).toMatchObject({ action: 'publish', version: 1, confirm: true });
});

it('editing a price switches to manual and blocks publication until saved', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Selling price for TikTok Likes' }).fill('900');
	await expect
		.element(page.getByRole('combobox', { name: 'Price mode for TikTok Likes' }))
		.toHaveValue('manual');
	await expect.element(page.getByRole('button', { name: 'Publish menu' })).toBeDisabled();
	await expect.element(page.getByText('Unsaved changes')).toBeVisible();
});

it('refreshes costs without overwriting an unsaved customer price', async () => {
	const fresh = fixture();
	fresh.quotes.row!.rateUsd = 0.1;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: RequestInfo | URL) =>
			Response.json({ success: true, data: String(url).includes('/sync') ? {} : fresh })
		)
	);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Selling price for TikTok Likes' }).fill('900');
	await page.getByRole('button', { name: 'Refresh costs' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Selling price for TikTok Likes' }))
		.toHaveValue(900);
	await expect.poll(() => document.querySelector('td.profit')?.textContent).toContain('₦750');
});

it('ignores a late supplier response after the code has changed again', async () => {
	let resolveFirst: (value: Response) => void = () => {};
	vi.stubGlobal(
		'fetch',
		vi.fn((url: RequestInfo | URL) =>
			String(url).includes('code=old')
				? new Promise<Response>((resolve) => {
						resolveFirst = resolve;
					})
				: Promise.resolve(
						Response.json({ success: true, data: { ...quote, name: 'Latest chosen service' } })
					)
		)
	);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('textbox', { name: 'Code for TikTok Likes' }).fill('old');
	await page.getByRole('spinbutton', { name: 'Pack quantity for TikTok Likes' }).click();
	await page.getByRole('textbox', { name: 'Code for TikTok Likes' }).fill('new');
	await page.getByRole('spinbutton', { name: 'Pack quantity for TikTok Likes' }).click();
	await expect.element(page.getByText('Latest chosen service')).toBeVisible();
	resolveFirst(Response.json({ success: true, data: { ...quote, name: 'Stale service' } }));
	await expect.element(page.getByText('Latest chosen service')).toBeVisible();
});

it('exports the edited sheet, not stale saved prices', async () => {
	const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Selling price for TikTok Likes' }).fill('950');
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const csv = await (create.mock.calls[0][0] as Blob).text();
	expect(csv).toContain('950');
	expect(csv).toContain('TikTok Likes');
});
it('does not let a lookup started before saving overwrite a later lookup', async () => {
	let old: (value: Response) => void = () => {};
	const v = fixture(2);
	v.sheet.rows[0].serviceId = 'old';
	vi.stubGlobal(
		'fetch',
		vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === 'POST')
				return Promise.resolve(Response.json({ success: true, data: v }));
			if (String(url).includes('code=old'))
				return new Promise<Response>((resolve) => {
					old = resolve;
				});
			return Promise.resolve(
				Response.json({ success: true, data: { ...quote, name: 'New after save' } })
			);
		})
	);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('textbox', { name: 'Code for TikTok Likes' }).fill('old');
	await page.getByRole('spinbutton', { name: 'Pack quantity for TikTok Likes' }).click();
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect.element(page.getByText('Saved draft · v2')).toBeVisible();
	await page.getByRole('textbox', { name: 'Code for TikTok Likes' }).fill('new');
	await page.getByRole('spinbutton', { name: 'Pack quantity for TikTok Likes' }).click();
	await expect.element(page.getByText('New after save')).toBeVisible();
	old(Response.json({ success: true, data: { ...quote, name: 'Old before save' } }));
	await expect.element(page.getByText('New after save')).toBeVisible();
});

it('fits mobile without sideways page scrolling and keeps extra settings collapsed', async () => {
	await page.viewport(390, 844);
	render(Page, { data: { pricing: fixture() } } as never);
	await expect.element(page.getByRole('heading', { name: 'Boosting Pricing' })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	expect(page.getByText('Profit budget %').query()).toBeNull();
	await page.screenshot({
		path: 'src/routes/admin/boosting-pricing/__screenshots__/mobile.png'
	});
});

it('keeps spreadsheet overflow inside the table on desktop', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1360);
	await page.screenshot({
		path: 'src/routes/admin/boosting-pricing/__screenshots__/desktop.png'
	});
});
