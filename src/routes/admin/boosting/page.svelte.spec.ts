import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '$lib/../app.css';
import Page from './+page.svelte';
import { sheet, quote } from '$lib/helpers/boosting-pricing-sheet-fixtures';
import type { BoostControlsView } from '$lib/helpers/boosting-pricing-controls';
import { supplierDetailsFixture } from '$lib/helpers/boosting-supplier-details-fixtures';
import type { BoostSupplierChoice } from '$lib/helpers/boosting-supplier-choice';
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

/** The pricing rules panel starts folded; open it (once) before reading or editing a rule. */
async function openPricingRules() {
	if (!document.querySelector<HTMLDetailsElement>('details.rules')?.open) {
		await page.getByText('Pricing rules', { exact: true }).click();
	}
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

const choice = (): BoostSupplierChoice => ({
	providerServiceId: '11111111-1111-4111-8111-111111111111',
	provider: 'bulk_follows',
	serviceId: '1234',
	name: 'Exact TikTok Likes',
	rateUsd: 0.08,
	min: 100,
	max: 100000,
	checkedAt: new Date().toISOString(),
	issues: [],
	publicationIssues: [],
	revision: 'a'.repeat(64),
	refillAdvertised: true,
	refillDaysClaimed: 30
});

it('treats profit preferences, reviewed-cost and unverified quality flags as advisory, with one explicit final Save', async () => {
	const initial = fixture();
	initial.sheet.settings.hardProfitNgn = 1000;
	initial.setup.row.maximumCostNgn = 5;
	initial.availability = {
		row: {
			reasons: ['A customer-facing service claim has not been verified.'],
			checkedAt: new Date().toISOString()
		}
	};
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		const sheet = JSON.parse(init!.body as string).sheet;
		delete sheet.rows[0].reviewRequested;
		return Response.json({ success: true, data: { ...initial, sheet } });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: initial } } as never);
	await expect.element(page.getByText('0 blocked', { exact: true })).toBeVisible();
	await expect.element(page.getByText('1 with advisories', { exact: true })).toBeVisible();
	const statusFilter = page.getByRole('combobox', { name: 'Status', exact: true });
	await statusFilter.selectOptions('review');
	await expect.element(page.getByText('No offers match these filters.')).toBeVisible();
	await statusFilter.selectOptions('advisory');
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toBeVisible();
	await statusFilter.selectOptions('all');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await expect
		.element(
			page.getByText('These preferences do not block your confirmed manual Save.', { exact: false })
		)
		.toBeVisible();
	await page.getByRole('button', { name: 'Review current price and cost', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Queued for final Save' })).toBeDisabled();
	expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	const review = page.getByRole('dialog', { name: 'Save these changes?' });
	await expect
		.element(review)
		.toHaveTextContent('Supplier cost reviewed with this Save: ₦81 per 1,000');
	await expect
		.element(review)
		.toHaveTextContent('Unverified quality requirements will be removed for future purchases');
	await review.getByRole('button', { name: 'Keep editing' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(500);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await review.getByRole('button', { name: 'Confirm & save' }).click();
	const submitted = JSON.parse(
		fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string
	);
	expect(submitted.sheet.rows[0]).toMatchObject({
		reviewRequested: true,
		sale: 500,
		selected: true
	});
	expect(submitted.confirmSave).toBe(true);
	expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('allows a hidden offer with only unverified quality claims to be ticked Live before the final Save', async () => {
	const initial = fixture();
	initial.sheet.rows[0].selected = false;
	initial.liveStatuses.row = 'hidden';
	initial.availability = {
		row: {
			reasons: ['A customer-facing service claim has not been verified.'],
			checkedAt: new Date().toISOString()
		}
	};
	render(Page, { data: { pricing: initial } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.toBeChecked();
});

it('displays a legacy pack per 1,000 and saves an edited rate without changing its quantity grid or rule basis', async () => {
	const initial = fixture();
	Object.assign(initial.sheet.rows[0], {
		units: 10,
		sale: 150,
		startingQuantity: 500,
		increment: 500
	});
	initial.setup.row.maximumCostNgn = 100;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		String(input).includes('/balances')
			? Response.json({ success: true, data: { providers: [] } })
			: Response.json({
					success: true,
					data: { ...initial, sheet: JSON.parse(init!.body as string).sheet }
				})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: initial } } as never);
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await expect.element(price).toHaveValue(15000);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect.element(page.getByRole('cell', { name: '₦81', exact: true })).toBeVisible();
	await expect.element(page.getByRole('cell', { name: /^₦14,919/ })).toBeVisible();
	await price.fill('15000.02');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Customer minimum for TikTok Likes value' }))
		.toHaveValue(500);
	await expect
		.element(page.getByRole('spinbutton', { name: 'Quantity increment for TikTok Likes value' }))
		.toHaveValue(500);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	const review = page.getByRole('dialog', { name: 'Save these changes?' });
	await expect.element(review).toHaveTextContent('₦15,000.02 per 1,000');
	await review.getByRole('button', { name: 'Confirm & save' }).click();
	const submitted = JSON.parse(
		fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string
	);
	expect(submitted.sheet.rows[0]).toMatchObject({
		units: 10,
		sale: 150.0002,
		startingQuantity: 500,
		increment: 500,
		priceMode: 'manual'
	});
	await expect.element(price).toHaveValue(15000.02);
});

it.each([true, false])(
	'chooses an exact supplier as a draft for an existing offer (%s), preserves price/quantities, and uses one final Save',
	async (configured) => {
		const initial = fixture();
		if (!configured) initial.sheet.rows[0].sourceOfferId = null;
		initial.sheet.rows[0].selected = false;
		initial.liveStatuses.row = 'hidden';
		initial.quotes.row = null;
		initial.sheet.rows[0].serviceId = '';
		initial.setup.row.reviewed = false;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes('/balances'))
				return Response.json({ success: true, data: { providers: [] } });
			if (String(input).includes('/supplier-choices'))
				return Response.json({ success: true, data: { services: [choice()], hasMore: false } });
			return Response.json({
				success: true,
				data: { ...initial, sheet: JSON.parse(init!.body as string).sheet }
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { data: { pricing: initial } } as never);
		await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
		await page.getByRole('button', { name: 'Choose supplier', exact: true }).click();
		await page.getByRole('combobox', { name: 'Supplier provider' }).selectOptions('bulk_follows');
		await page.getByRole('textbox', { name: 'Search supplier services' }).fill('1234');
		await page.getByRole('button', { name: 'Use BulkFollows 1234' }).click();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
			.toHaveValue(900);
		await expect
			.element(page.getByRole('spinbutton', { name: 'Customer minimum for TikTok Likes value' }))
			.toHaveValue(100);
		await expect
			.element(page.getByRole('spinbutton', { name: 'Quantity increment for TikTok Likes value' }))
			.toHaveValue(100);
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
		await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
		await expect
			.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
			.toBeChecked();
		await page.getByRole('button', { name: 'Save all changes' }).click();
		const review = page.getByRole('dialog', { name: 'Save these changes?' });
		await expect.element(review).toHaveTextContent('BulkFollows #1234 · Exact TikTok Likes');
		await expect.element(review).toHaveTextContent('This exact service will stay selected');
		await review.getByRole('button', { name: 'Confirm & save' }).click();
		const submitted = JSON.parse(
			fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string
		);
		expect(submitted.sheet.rows[0]).toMatchObject({
			supplierChoiceId: choice().providerServiceId,
			supplierChoiceRevision: choice().revision,
			sale: 900,
			selected: true,
			priceMode: 'manual'
		});
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
	}
);

it('allows the owner to approve a displayed preload in the same final Live Save', async () => {
	const initial = fixture();
	initial.sheet.rows[0].selected = false;
	initial.liveStatuses.row = 'hidden';
	initial.setup.row.reviewed = false;
	initial.setup.row.approvalServices = [
		{ id: 'service', provider: 'smm_raja', serviceId: 's1675', name: 'TikTok Likes' }
	];
	initial.availability = {
		row: {
			reasons: ['The supplier mapping is not approved and enabled.'],
			checkedAt: new Date().toISOString()
		}
	};
	render(Page, { data: { pricing: initial } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.toBeChecked();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	const review = page.getByRole('dialog', { name: 'Save these changes?' });
	await expect.element(review).toHaveTextContent('Supplier approval');
	await expect.element(review).toHaveTextContent('SMM Raja #s1675 · TikTok Likes');
});

it('keeps genuine supplier problems visible and lets the owner cancel or retry a failed picker without losing edits', async () => {
	const initial = fixture();
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		String(input).includes('/balances')
			? Response.json({ success: true, data: { providers: [] } })
			: Response.json({ success: false }, { status: 503 })
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: initial } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await page.getByRole('button', { name: /SMM Raja #s1675/ }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Your draft is kept');
	await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	await page.getByRole('button', { name: 'Close supplier picker' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
	expect(
		fetchMock.mock.calls.every(([, init]: any) => !init?.method || init.method === 'GET')
	).toBe(true);
});

it('cancels or confirms discarding a draft without making a server write', async () => {
	const fetchMock = vi.fn(async () => Response.json({ success: true, data: { providers: [] } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await price.fill('900');
	await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await expect.element(price).toHaveValue(900);
	await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Discard unsaved changes?' })
		.getByRole('button', { name: 'Discard draft', exact: true })
		.click();
	await expect.element(price).toHaveValue(500);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(fetchMock.mock.calls).toHaveLength(1);
});

it('requires confirmation before replacing drafts with saved settings, and keeps them after a failed reload', async () => {
	let fail = true;
	const fresh = fixture();
	fresh.sheet.rows[0].sale = 1000;
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		String(input).includes('/balances')
			? Response.json({ success: true, data: { providers: [] } })
			: fail
				? Response.json({ success: false }, { status: 503 })
				: Response.json({ success: true, data: fresh })
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await price.fill('900');
	await page.getByRole('button', { name: 'Reload saved', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Reload saved settings?' })).toBeVisible();
	expect(fetchMock.mock.calls).toHaveLength(1);
	await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Saved settings could not load. Your draft is kept.');
	await expect.element(price).toHaveValue(900);
	fail = false;
	await page.getByRole('button', { name: 'Reload saved', exact: true }).click();
	await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
	await expect.element(price).toHaveValue(1000);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	for (const [, options] of fetchMock.mock.calls as Array<[unknown, RequestInit?]>)
		expect(options?.method ?? 'GET').toBe('GET');
});

it('does not repeat an uncertain Save and can confirm the committed result with a read-only reload', async () => {
	const fresh = fixture();
	fresh.sheet.rows[0].sale = 900;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		if (options?.method === 'POST') throw new TypeError('Network disconnected after commit');
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await price.fill('900');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect
		.element(page.getByText('We couldn’t confirm whether Save finished.', { exact: false }))
		.toBeVisible();
	await expect.element(price).toHaveValue(900);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Check saved settings', exact: true }).click();
	await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
	await expect
		.element(page.getByText('We couldn’t confirm whether Save finished.', { exact: false }))
		.not.toBeInTheDocument();
	await expect.element(price).toHaveValue(900);
	expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('filters actual live offers independently of draft ticks and can clear an empty search', async () => {
	const data = fixture();
	data.sheet.rows[0].selected = false;
	render(Page, { data: { pricing: data } } as never);
	await page.getByRole('combobox', { name: 'Status' }).selectOptions('live');
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toBeVisible();
	await page.getByRole('combobox', { name: 'Status' }).selectOptions('all');
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('combobox', { name: 'Status' }).selectOptions('edited');
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toBeVisible();
	await page.getByRole('textbox', { name: 'Search offers' }).fill('not-a-service');
	await expect.element(page.getByText('No offers match these filters.')).toBeVisible();
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
});

it('keeps a full-size catalogue editable and isolates edits to the intended offer', async () => {
	const data = fixture();
	const original = structuredClone(data.sheet.rows[0]);
	data.sheet.rows = Array.from({ length: 120 }, (_, index) => ({
		...original,
		id: `row-${index}`,
		sourceOfferId: `offer-${index}`,
		title: `TikTok Likes ${index + 1}`,
		selected: false
	}));
	data.quotes = Object.fromEntries(
		data.sheet.rows.map((row) => [row.id, structuredClone(data.quotes.row)])
	);
	data.setup = Object.fromEntries(data.sheet.rows.map((row) => [row.id, { ...data.setup.row }]));
	data.liveStatuses = Object.fromEntries(data.sheet.rows.map((row) => [row.id, 'hidden']));
	render(Page, { data: { pricing: data } } as never);
	await page
		.getByRole('spinbutton', { name: 'Price for TikTok Likes 40 value', exact: true })
		.fill('900');
	await page.getByRole('combobox', { name: 'Status' }).selectOptions('edited');
	await expect.element(page.getByText('Showing 1 of 120 offers.', { exact: false })).toBeVisible();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes 40 value', exact: true }))
		.toHaveValue(900);
	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes 1 value', exact: true }))
		.toHaveValue(500);
});

it('opens the same final review with Ctrl+S but does not submit it without confirmation', async () => {
	const fetchMock = vi.fn(async () => Response.json({ success: true, data: { providers: [] } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }));
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	expect(fetchMock.mock.calls).toHaveLength(1);
	expect(document.body.style.overflow).toBe('hidden');
	await page.getByRole('button', { name: 'Keep editing' }).click();
	expect(document.body.style.overflow).not.toBe('hidden');
});

it('refreshes supplier balances without resetting price, quantity, lock or Live drafts', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	const records = (balance = 25.45) => [
		{
			id: 'smm_raja',
			label: 'SMM Raja',
			configured: true,
			balance,
			currency: 'USD',
			checkedAt: new Date().toISOString(),
			error: null
		},
		{
			id: 'bulk_follows',
			label: 'BulkFollows',
			configured: true,
			balance: 0.32,
			currency: 'USD',
			checkedAt: new Date().toISOString(),
			error: null
		}
	];
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records() } }))
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records(20) } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	const refresh = page.getByRole('button', { name: 'Refresh SMM Raja balance' });
	await expect.element(refresh).toHaveTextContent('USD 25.45');
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await price.fill('900');
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	const quantity = page.getByRole('spinbutton', {
		name: 'Customer minimum for TikTok Likes value'
	});
	await quantity.fill('200');
	await refresh.click();
	await expect.element(refresh).toHaveTextContent('USD 20.00');
	await expect.element(price).toHaveValue(900);
	await expect.element(quantity).toHaveValue(200);
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.toBeChecked();
	await expect
		.element(page.getByRole('button', { name: 'Unlock TikTok Likes value price' }))
		.toBeVisible();
	expect(
		fetchMock.mock.calls.filter((c) => (c as [unknown, RequestInit?])[1]?.method === 'POST')
	).toHaveLength(0);
});

it('identifies an automatic row as a pricing cost reference rather than a promised primary supplier', async () => {
	const data = fixture();
	data.setup.row.routingPolicy = 'automatic';
	render(Page, { data: { pricing: data } } as never);
	const source = page.getByRole('button', { name: /SMM Raja.*Cost reference/ });
	await expect
		.element(source)
		.toHaveAttribute('title', expect.stringContaining('not a fixed primary supplier'));
});

it('does not repeat the result name as an option label when several options exist', async () => {
	const data = fixture();
	data.sheet.rows[0].option = 'TikTok Likes';
	data.sheet.rows.push({
		...data.sheet.rows[0],
		id: 'second',
		tier: 'stable',
		option: 'More stable'
	});
	render(Page, { data: { pricing: data } } as never);
	const row = page
		.getByRole('row')
		.filter({ has: page.getByRole('button', { name: 'TikTok Likes', exact: true }) })
		.first();
	await expect.element(row).toHaveTextContent('Affordable');
});

it('explains known funding problems without preventing hidden draft price saves', async () => {
	const data = fixture();
	data.sheet.rows[0].selected = false;
	data.availability = {
		row: {
			reasons: ['The recorded supplier balance is insufficient after its safety reserve.'],
			checkedAt: new Date().toISOString()
		}
	};
	render(Page, { data: { pricing: data } } as never);
	const live = page.getByRole('checkbox', { name: 'Live TikTok Likes value' });
	await live.click();
	await expect.element(live).not.toBeChecked();
	await expect
		.element(
			page.getByText('The recorded supplier balance is insufficient after its safety reserve.', {
				exact: true
			})
		)
		.toBeVisible();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	await expect.element(page.getByRole('dialog')).toHaveTextContent('0 going live');
});
it('uses one Save and locks edited customer prices', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
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
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	expect(
		getComputedStyle(page.getByRole('dialog', { name: 'Save these changes?' }).element())
			.backgroundColor
	).toBe('rgb(11, 15, 18)');
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect
		.poll(() => fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length)
		.toBe(1);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({ action: 'save', sheet: { rows: [{ sale: 900 }] } });
	expect(page.getByRole('button', { name: 'Publish menu' }).query()).toBeNull();
});

it('keeps offer settings as drafts through close and supplier inspection, then confirms them in one Save', async () => {
	const original = fixture();
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		if (String(input).includes('/supplier-details'))
			return Response.json({ success: true, data: supplierDetailsFixture() });
		return Response.json({
			success: true,
			data: { ...original, sheet: JSON.parse(init!.body as string).sheet }
		});
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page
		.getByRole('spinbutton', { name: 'Customer minimum for TikTok Likes value' })
		.fill('200');
	await page
		.getByRole('spinbutton', { name: 'Quantity increment for TikTok Likes value' })
		.fill('200');
	await page
		.getByRole('spinbutton', { name: 'Customer maximum for TikTok Likes value' })
		.fill('10000');
	await page
		.getByRole('textbox', { name: 'Customer option name for TikTok Likes value' })
		.fill('Everyday likes');
	await page
		.getByRole('textbox', { name: 'Customer description for TikTok Likes value' })
		.fill('A straightforward option.');
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(500);
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	await page.getByRole('button', { name: 'Close details', exact: true }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Quantity increment for TikTok Likes value' }))
		.toHaveValue(200);
	await expect
		.element(page.getByRole('spinbutton', { name: 'Customer minimum for TikTok Likes value' }))
		.toHaveValue(200);
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Save these changes?' });
	for (const text of [
		'Customer minimum',
		'Quantity increment',
		'Customer maximum',
		'Option name',
		'Customer description'
	])
		await expect.element(dialog.getByText(text, { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Keep editing' }).click();
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect
		.poll(() => fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length)
		.toBe(1);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({
		action: 'save',
		confirmSave: true,
		sheet: {
			rows: [
				{
					startingQuantity: 200,
					increment: 200,
					maximumQuantity: 10000,
					option: 'Everyday likes',
					shortPromise: 'A straightforward option.',
					sale: 500,
					priceMode: 'manual'
				}
			]
		}
	});
});

it('rejects invalid quantity input without losing other edits, and keeps it visible after closing', async () => {
	const fetchMock = vi.fn(async () => Response.json({ success: true, data: { providers: [] } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	const minimum = page.getByRole('spinbutton', { name: 'Customer minimum for TikTok Likes value' });
	await minimum.fill('0');
	await expect.element(minimum).toHaveAttribute('aria-invalid', 'true');
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await expect.element(minimum).toHaveValue(0);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	expect(page.getByRole('dialog', { name: 'Save these changes?' }).query()).toBeNull();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	await minimum.fill('200');
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	expect(fetchMock.mock.calls).toHaveLength(1); // Discovery GET only; no confirmation yet.
});

it('rejects an inexact increment and accepts it when the owner corrects the price, without moving locks', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('500.01');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	const increment = page.getByRole('spinbutton', {
		name: 'Quantity increment for TikTok Likes value'
	});
	await increment.fill('200');
	await expect.element(increment).toHaveAttribute('aria-invalid', 'true');
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await expect.element(increment).toHaveAttribute('aria-invalid', 'false');
	await expect
		.element(page.getByRole('button', { name: 'Unlock TikTok Likes value price' }))
		.toBeVisible();
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await expect
		.element(page.getByRole('dialog', { name: 'Save these changes?' }))
		.toHaveTextContent('Quantity increment');
});

it('allows temporary empty price input without crashing and blocks invalid Save before confirmation', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	const price = page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' });
	await price.fill('');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Check price and profit.');
	expect(page.getByRole('dialog', { name: 'Save these changes?' }).query()).toBeNull();
	await price.fill('900');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
});
it('reviews all edits together and cancellation preserves the whole draft without any save request', async () => {
	const original = fixture();
	const first = original.sheet.rows[0];
	original.sheet.rows.push({
		...first,
		id: 'second',
		sourceOfferId: 'second-offer',
		title: 'Instagram Followers',
		platform: 'instagram',
		outcome: 'followers',
		selected: false,
		priceMode: 'target'
	});
	original.liveStatuses.second = 'hidden';
	original.quotes.second = { ...original.quotes.row! };
	original.setup.second = { ...original.setup.row };
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		return Response.json({
			success: true,
			data: { ...original, sheet: JSON.parse(init!.body as string).sheet }
		});
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('spinbutton', { name: 'Price for Instagram Followers value' }).fill('950');
	await page.getByRole('checkbox', { name: 'Live Instagram Followers value' }).click();
	await openPricingRules();
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Save these changes?' });
	await expect
		.element(dialog.getByText('2 offers changed · 1 going live · 1 going offline'))
		.toBeVisible();
	await expect
		.element(dialog.getByRole('region', { name: 'Pricing rule changes' }))
		.toHaveTextContent('₦1,500 → ₦2,000');
	await expect
		.element(dialog.getByRole('region', { name: 'Changes for Instagram Followers' }))
		.toHaveTextContent('Price lock');
	await expect
		.element(dialog.getByRole('region', { name: 'Changes for TikTok Likes' }))
		.toHaveTextContent('₦500 per 1,000 → ₦900 per 1,000');
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await dialog.getByRole('button', { name: 'Keep editing' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	await expect
		.element(page.getByRole('checkbox', { name: 'Live Instagram Followers value' }))
		.toBeChecked();
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.not.toBeChecked();
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect
		.poll(() => fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length)
		.toBe(1);
	const body = JSON.parse(
		fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string
	);
	expect(body).toMatchObject({
		action: 'save',
		confirmSave: true,
		sheet: {
			settings: { fx: 2000 },
			rows: [
				{ sale: 900, selected: false },
				{ sale: 950, selected: true, priceMode: 'manual' }
			]
		}
	});
});

it('allows the dev-only preview to demonstrate Save without making any network request', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() }, previewOnly: true } as never);
	await expect
		.element(page.getByRole('complementary', { name: 'Local preview notice' }))
		.toBeVisible();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(fetchMock).not.toHaveBeenCalled();
});
it('saves prices and pending Live selections together only after final confirmation', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		const fresh = structuredClone(original);
		fresh.sheet = JSON.parse(init!.body as string).sheet;
		fresh.liveStatuses.row = 'live';
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	await expect
		.element(page.getByText('1 offer changed · 1 going live · 0 going offline'))
		.toBeVisible();
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.toBeChecked();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(page.getByRole('dialog', { name: 'Save these changes?' }).query()).toBeNull();
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({ action: 'save', confirmSave: true });
});
it('previews automatic prices but preserves manual locks when the dollar rate changes', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await openPricingRules();
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(500);
	await page.getByRole('button', { name: 'Unlock TikTok Likes value price' }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(150);
	await openPricingRules();
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
			data: String(input).includes('/balances') ? { providers: [] } : fixture()
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: view } } as never);
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	expect(
		fetchMock.mock.calls.filter(
			(c) => (c as unknown as [unknown, RequestInit])[1]?.method === 'POST'
		)
	).toHaveLength(0);
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
});
it('requires confirmation before add-only catalogue expansion', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).includes('/balances') ? { providers: [] } : fixture(),
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
it('confirms an unavailable hidden price draft without publishing it', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	original.quotes.row!.issues = ['Supplier unavailable.'];
	original.setup.row.reviewed = false;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		const fresh = structuredClone(original);
		fresh.sheet = JSON.parse(init!.body as string).sheet;
		return Response.json({ success: true, data: fresh });
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect
		.element(page.getByText('1 offer changed · 0 going live · 0 going offline'))
		.toBeVisible();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
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
		confirmSave: true,
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
		.element(page.getByRole('button', { name: 'Supplier details', exact: true }))
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
		.element(page.getByRole('button', { name: 'Supplier details', exact: true }))
		.toBeEnabled();
	await expect
		.element(page.getByRole('button', { name: 'Save all changes', exact: true }))
		.toBeDisabled();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect
		.element(page.getByRole('button', { name: 'TikTok Likes', exact: true }))
		.toHaveAttribute('aria-expanded', 'false');
	expect(document.activeElement?.id).toBe('boost-offer-row');
});
it('keeps edited prices on Close and offers Save without scrolling back to the header', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
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
		.element(page.getByText('Save reviews all pending changes. Closing keeps your edits.'))
		.toBeVisible();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
	await expect.element(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
	expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({
		action: 'save',
		confirmSave: true,
		sheet: { rows: [{ sale: 950 }] }
	});
});
it('keeps the details open and preserves edits when inline Save fails', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('/balances')
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
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
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
			data: String(input).includes('/balances') ? { providers: [] } : fixture()
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await expect.element(page.getByRole('dialog', { name: 'Save these changes?' })).toBeVisible();
	expect(
		fetchMock.mock.calls.filter((c) => (c as [unknown, RequestInit?])[1]?.method === 'POST')
	).toHaveLength(0);
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Save all changes', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
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
		.element(page.getByRole('button', { name: 'Save all changes', exact: true }))
		.toBeDisabled();
	const close = page
		.getByRole('button', { name: 'Close', exact: true })
		.element()
		.getBoundingClientRect();
	expect(close.left).toBeGreaterThanOrEqual(0);
	expect(close.right).toBeLessThanOrEqual(390);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
	// Diagnostic screenshots are taken from the real localhost page, not Vitest's resizing iframe.
});
it('allows viewing supplier details with unsaved prices while still protecting catalogue expansion', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await expect.element(page.getByRole('button', { name: 'Refresh costs' })).toBeEnabled();
	await expect.element(page.getByRole('button', { name: '+ Expand catalogue' })).toBeDisabled();
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	await expect
		.element(page.getByRole('dialog', { name: 'TikTok Likes · Supplier details' }))
		.toBeVisible();
	await page.getByRole('button', { name: 'Close details', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
});

it('keeps prices, rules and pending Live ticks while inspecting both providers and then uses the single Save', async () => {
	const original = fixture();
	original.sheet.rows[0].selected = false;
	original.liveStatuses.row = 'hidden';
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
			return Response.json({ success: true, data: { providers: [] } });
		if (String(input).includes('/supplier-details'))
			return Response.json({ success: true, data: supplierDetailsFixture() });
		return Response.json({
			success: true,
			data: { ...original, sheet: JSON.parse(init!.body as string).sheet }
		});
	});
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('900');
	await openPricingRules();
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await page.getByRole('checkbox', { name: 'Live TikTok Likes value' }).click();
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'TikTok Likes · Supplier details' });
	await expect
		.element(dialog.getByRole('region', { name: 'SMM Raja supplier records' }))
		.toHaveTextContent('₦400');
	await expect
		.element(dialog.getByRole('region', { name: 'BulkFollows supplier records' }))
		.toHaveTextContent('Mapping paused');
	await expect.element(dialog.getByText('30 days—supplier claim', { exact: true })).toBeVisible();
	await expect.element(dialog.getByText('Not verified', { exact: true })).toBeVisible();
	expect(
		fetchMock.mock.calls.filter((c) => ['POST', 'PUT', 'PATCH'].includes(c[1]?.method ?? 'GET'))
	).toHaveLength(0);
	expect(dialog.getByRole('button', { name: /^save/i }).query()).toBeNull();
	await expect.element(dialog.getByRole('button', { name: 'Refresh saved details' })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close details', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(900);
	await openPricingRules();
	await expect.element(page.getByRole('spinbutton', { name: 'Dollar rate' })).toHaveValue(2000);
	await expect
		.element(page.getByRole('checkbox', { name: 'Live TikTok Likes value' }))
		.toBeChecked();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
	await expect
		.poll(() => fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST').length)
		.toBe(1);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1]!.body as string)
	).toMatchObject({
		action: 'save',
		confirmSave: true,
		sheet: { settings: { fx: 2000 }, rows: [{ sale: 900, selected: true, priceMode: 'manual' }] }
	});
});

it('allows closing failed supplier details without losing draft edits or forcing any save', async () => {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
		String(input).includes('/balances')
			? Response.json({ success: true, data: { providers: [] } })
			: Response.json(
					{
						success: false,
						error: 'Supplier details could not load. Your pricing edits are kept.'
					},
					{ status: 503 }
				)
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: fixture() } } as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	await expect.element(page.getByRole('alert')).toHaveTextContent('Your pricing edits are kept.');
	await page.getByRole('button', { name: 'Close supplier details', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
	await expect.element(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
	expect(fetchMock.mock.calls.every((c) => !c[1]?.method || c[1].method === 'GET')).toBe(true);
});

it('shows sample supplier details without requests and retains draft prices on close', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Page, {
		data: { pricing: fixture() },
		previewOnly: true,
		previewSupplierDetails: { row: supplierDetailsFixture() }
	} as never);
	await page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }).fill('950');
	await page.getByRole('button', { name: 'TikTok Likes', exact: true }).click();
	await page.getByRole('button', { name: 'Supplier details', exact: true }).click();
	await expect
		.element(page.getByText('Illustrative supplier records only—not real services or balances.'))
		.toBeVisible();
	await page.getByRole('button', { name: 'Close details', exact: true }).click();
	await expect
		.element(page.getByRole('spinbutton', { name: 'Price for TikTok Likes value' }))
		.toHaveValue(950);
	expect(fetchMock).not.toHaveBeenCalled();
});
it('recovers a failed Save through cost refresh without losing price or rule edits', async () => {
	let saveAttempts = 0;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).includes('/balances'))
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
	await openPricingRules();
	await page.getByRole('spinbutton', { name: 'Dollar rate' }).fill('2000');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
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
	await openPricingRules();
	await expect.element(page.getByRole('spinbutton', { name: 'Dollar rate' })).toHaveValue(2000);
	expect(
		JSON.parse(fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/sync'))![1]!.body as string)
	).toEqual({ refreshPrices: false });
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Confirm & save' }).click();
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
			data: String(input).includes('/balances') ? { providers: [] } : fresh
		})
	);
	vi.stubGlobal('fetch', fetchMock);
	render(Page, { data: { pricing: original } } as never);
	await openPricingRules();
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
				String(c[0]).includes('/balances') ||
				String(c[0]).endsWith('/sync') ||
				(c as [unknown, RequestInit?])[1]?.method !== 'POST'
		)
	).toBe(true);
});
it('keeps edits on refresh failure or concurrent offer changes instead of silently overwriting them', async () => {
	let concurrent = false;
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).includes('/balances'))
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
	await expect.element(page.getByRole('heading', { name: 'Boosting', exact: true })).toBeVisible();
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
it('matches the native Numbers-style layout on desktop', async () => {
	render(Page, { data: { pricing: fixture() } } as never);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1360);
});
it('finds a service fast: remembered platform buttons, a header per service and a folded rules summary', async () => {
	const original = fixture();
	original.sheet.rows.push({
		...original.sheet.rows[0],
		id: 'second',
		sourceOfferId: 'second-offer',
		title: 'Instagram Followers',
		platform: 'instagram',
		outcome: 'followers',
		selected: false
	});
	original.liveStatuses.second = 'hidden';
	original.quotes.second = { ...original.quotes.row! };
	original.setup.second = { ...original.setup.row };
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: { providers: [] } }))
	);
	localStorage.removeItem('fastaccs-admin-boosting-platform');
	render(Page, { data: { pricing: original } } as never);
	// The rules are folded to one line that still shows the values in force.
	await expect.element(page.getByText(/\$1 = ₦[\d,]+ · \d+% markup/)).toBeVisible();
	expect(page.getByRole('spinbutton', { name: 'Dollar rate' }).query()).toBeNull();
	// One tap shows a platform's services only, and the choice is remembered for next time.
	const platforms = page.getByRole('group', { name: 'Platform' });
	await platforms.getByRole('button', { name: /^Instagram/ }).click();
	await expect
		.element(platforms.getByRole('button', { name: /^Instagram/ }))
		.toHaveAttribute('aria-pressed', 'true');
	expect(localStorage.getItem('fastaccs-admin-boosting-platform')).toBe('instagram');
	await expect
		.element(page.getByRole('button', { name: 'Instagram Followers', exact: true }))
		.toBeVisible();
	expect(page.getByRole('button', { name: 'TikTok Likes', exact: true }).query()).toBeNull();
	// Each service gets a header with its platform, options and how many are live.
	await expect
		.poll(() => document.querySelector('.group-row th')?.textContent?.replace(/\s+/g, ' ').trim())
		.toBe('Instagram Followers Instagram · 1 option · 0 live');
	localStorage.removeItem('fastaccs-admin-boosting-platform');
});
it('says a supplier needs funding once at the top instead of on every offer row', async () => {
	const data = fixture();
	data.availability = {
		row: {
			reasons: ['The recorded supplier balance is insufficient after its safety reserve.'],
			checkedAt: new Date().toISOString()
		}
	};
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ success: true, data: { providers: [] } }))
	);
	render(Page, { data: { pricing: data } } as never);
	const notice = page.getByRole('status').filter({ hasText: 'Supplier funding needed' });
	await expect.element(notice).toBeVisible();
	await expect.element(notice).toHaveTextContent(/SMM Raja: 1 offer/);
	await expect
		.poll(() => document.querySelector('.offer-row .badge')?.textContent ?? '')
		.not.toMatch(/balance/i);
	await expect
		.poll(() => document.querySelector('.offer-row .badge')?.getAttribute('title') ?? '')
		.toMatch(/balance is insufficient/);
});
