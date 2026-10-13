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
it('asks for explicit approval before newly selected Live offers are saved', async () => {
	const view = fixture();
	view.sheet.rows[0].selected = false;
	view.liveStatuses.row = 'reviewed';
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).includes('/discovery') ? { providers: [] } : fixture()
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: view } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Publish 1 offer?' })).toBeVisible();
	expect(
		fetchMock.mock.calls.filter(
			(c) => (c as unknown as [unknown, RequestInit])[1]?.method === 'POST'
		)
	).toHaveLength(0);
	await page.getByRole('button', { name: 'Publish selected & save' }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
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
it('saves an unavailable hidden price as a draft without offering to publish it', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	original.quotes.row!.issues = ['Supplier unavailable.'];
	original.setup.row.reviewed = false;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/discovery'))
			return Response.json({ success: true, data: { providers: [] } });
		const fresh = structuredClone(original);
		fresh.sheet = JSON.parse(init!.body as string).sheet;
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.not.toBeChecked();
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({
		action: 'save',
		confirmPublish: false,
		sheet: { rows: [{ sale: 900, selected: false }] }
	});
	expect(page.getByRole('dialog').query()).toBeNull();
});
it('makes a blocked Live attempt explain the supplier issue without selecting or publishing it', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.sheet.rows[0].priceMode = 'manual';
	original.sheet.rows[0].useDefaultMarkup = false;
	original.liveStatuses.row = 'hidden';
	original.quotes.row!.issues = ['Supplier unavailable.'];
	original.setup.row.reviewed = false;
	const fetchMock = vi.fn(async () => Response.json({ success: true, data: { providers: [] } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	const live = page.getByRole('checkbox', { name: 'Live TikTok Likes value' });
	await expect.element(live).toBeEnabled();
	await live.click();
	await expect.element(live).not.toBeChecked();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Supplier unavailable.');
	await expect
		.element(page.getByRole('button', { name: 'Supplier setup', exact: true }))
		.toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(fetchMock.mock.calls).toHaveLength(1);
});
it('always allows a live offer to be switched off even when supplier costs are unavailable', async () => {
	const original = fixture();
	original.quotes.row = null;
	original.setup.row.reviewed = false;
	render(Page, { data: { pricing: original } } as never);
	const live = page.getByRole('checkbox', { name: 'Live TikTok Likes value' });
	await expect.element(live).toBeEnabled();
	await live.click();
	await expect.element(live).not.toBeChecked();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
	expect(page.getByRole('alert').query()).toBeNull();
});
it('does not create unsaved edits just by opening an older hidden offer for review', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	delete original.sheet.rows[0].useDefaultMarkup;
	original.liveStatuses.row = 'hidden';
	original.setup.row.reviewed = false;
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect
		.element(page.getByRole('button', { name: 'Supplier setup', exact: true }))
		.toBeEnabled();
	await expect
		.element(page.getByRole('button', { name: 'Save changes', exact: true }))
		.toBeDisabled();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toHaveAttribute('aria-expanded', 'false');
	expect(document.activeElement?.id).toBe('boost-offer-row');
});
it('keeps edited prices on Close and offers Save without scrolling back to the header', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/discovery'))
			return Response.json({ success: true, data: { providers: [] } });
		const next = fixture();
		next.sheet = JSON.parse(init!.body as string).sheet;
		return Response.json({ success: true, data: next });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await expect
		.element(page.getByText('Save applies all pricing changes. Closing keeps your edits.'))
		.toBeVisible();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
	await expect.element(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({ action: 'save', confirmPublish: false, sheet: { rows: [{ sale: 950 }] } });
});
it('keeps the details open and preserves edits when inline Save fails', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('/discovery')
				? Response.json({ success: true, data: { providers: [] } })
				: Response.json({ success: false, error: 'Save failed. Try again.' }, { status: 503 })
		)
	);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toHaveAttribute('aria-expanded', 'true');
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Save failed. Try again.');
	await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
});
it('retains explicit publication confirmation when saving from the expanded row', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).includes('/discovery') ? { providers: [] } : fixture()
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Publish 1 offer?' })).toBeVisible();
	expect(
		fetchMock.mock.calls.filter((c) => (c as [unknown, RequestInit?])[1]?.method === 'POST')
	).toHaveLength(0);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	await page.getByRole('button', { name: 'Publish selected & save' }).click();
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toHaveAttribute('aria-expanded', 'false');
	expect(
		fetchMock.mock.calls.filter((c) => (c as [unknown, RequestInit?])[1]?.method === 'POST')
	).toHaveLength(1);
});
it('keeps review actions inside the mobile viewport after a blocked Live click', async () => {
	await page.viewport(390, 844);
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.setup.row.reviewed = false;
	original.liveStatuses.row = 'hidden';
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
	await expect
		.element(page.getByRole('button', { name: 'Save changes', exact: true }))
		.toBeDisabled();
	const close = page
		.getByRole('button', { name: 'Close', exact: true })
		.element()
		.getBoundingClientRect();
	expect(close.left).toBeGreaterThanOrEqual(0);
	expect(close.right).toBeLessThanOrEqual(390);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	await page.screenshot({
		path: 'src/routes/admin/boosting-pricing/__screenshots__/mobile-review.png'
	});
});
it('allows cost refresh with unsaved prices while still protecting catalogue and supplier setup', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await expect.element(page.getByRole('button', { name: 'Refresh costs' })).toBeEnabled();
	await expect.element(page.getByRole('button', { name: '+ Expand catalogue' })).toBeDisabled();
	await page.getByRole('button', { name: 'SMM Raja' }).click();
	expect(page.getByRole('dialog', { name: 'TikTok Likes · Supplier setup' }).query()).toBeNull();
});
it('recovers a failed Save through cost refresh without losing price or rule edits', async () => {
	let saveAttempts = 0;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/discovery'))
			return Response.json({ success: true, data: { providers: [] } });
		if (String(input).endsWith('/sync'))
			return Response.json({ success: true, data: { synced: 1 } });
		const fresh = fixture();
		fresh.quotes.row!.rateUsd = 0.06;
		if (init?.method === 'POST') {
			saveAttempts++;
			if (saveAttempts === 1)
				return Response.json(
					{
						success: false,
						error: 'TikTok Likes: click Refresh costs, then Save. Your edits will be kept.'
					},
					{ status: 400 }
				);
			fresh.sheet = JSON.parse(init.body as string).sheet;
		}
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect
		.element(
			page.getByText('TikTok Likes: click Refresh costs, then Save. Your edits will be kept.', {
				exact: true
			})
		)
		.toBeVisible();
	await page.getByRole('button', { name: 'Refresh costs' }).click();
	await expect
		.poll(() => fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/sync')))
		.toBe(true);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	await expect.element(page.getByRole('spinbutton', { name: 'Dollar rate' })).toHaveValue(2000);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/sync'))![1]!.body as string)
	).toEqual({ refreshPrices: false });
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.poll(() => saveAttempts).toBe(2);
	const saves = fetchMock.mock.calls.filter(
		(c) => c[1]?.method === 'POST' && !String(c[0]).endsWith('/sync')
	);
	expect(JSON.parse(saves[1][1]!.body as string).sheet).toMatchObject({
		settings: { fx: 2000 },
		rows: [{ sale: 900, priceMode: 'manual', selected: true }]
	});
});
it('refreshes automatic previews without saving prices or enabling hidden offers', async () => {
	const original = fixture();
	original.sheet.rows[0].priceMode = 'target';
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	const fresh = structuredClone(original);
	fresh.quotes.row!.rateUsd = 0.1;
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).includes('/discovery') ? { providers: [] } : fresh
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await page.getByRole('button', { name: 'Refresh costs' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(300);
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.not.toBeChecked();
	expect(
		fetchMock.mock.calls.every(
			(c) =>
				String(c[0]).includes('/discovery') ||
				String(c[0]).endsWith('/sync') ||
				(c as [unknown, RequestInit?])[1]?.method !== 'POST'
		)
	).toBe(true);
});
it('keeps edits on refresh failure or concurrent offer changes instead of silently overwriting them', async () => {
	let concurrent = false;
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).includes('/discovery'))
			return Response.json({ success: true, data: { providers: [] } });
		if (String(input).endsWith('/sync'))
			return Response.json({ success: concurrent, error: 'Supplier unavailable.' });
		const fresh = fixture();
		fresh.sheet.version = 2;
		fresh.sheet.rows[0].serviceId = 'another';
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'Refresh costs' }).click();
	await expect.element(page.getByText('Supplier unavailable.', { exact: true })).toBeVisible();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	concurrent = true;
	await page.getByRole('button', { name: 'Refresh costs' }).click();
	await expect
		.element(
			page.getByText(
				'Offer settings changed elsewhere. Your edits are kept; export them before reloading.',
				{ exact: true }
			)
		)
		.toBeVisible();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
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
