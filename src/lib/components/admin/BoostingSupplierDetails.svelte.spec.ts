import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Details from './BoostingSupplierDetails.svelte';
import { supplierDetailsFixture } from '$lib/helpers/boosting-supplier-details-fixtures';
import '$lib/../app.css';

afterEach(() => vi.unstubAllGlobals());

it('keeps unknown charges/balances separate from zero, and advertised refill separate from verification', async () => {
	const data = supplierDetailsFixture();
	data.providers[0].balance = null;
	data.providers[0].balanceCheckedAt = null;
	data.providers[0].services[0].rateUsd = null;
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Details, {
		offerId: 'offer',
		quantity: 1000,
		fx: 1500,
		initialData: data,
		previewOnly: true
	});
	const unknown = page.getByRole('region', { name: 'SMM Raja supplier records' });
	await expect.element(unknown).toHaveTextContent('Not recorded');
	await expect.element(unknown).toHaveTextContent('Not verified');
	await expect
		.element(page.getByRole('region', { name: 'BulkFollows supplier records' }))
		.toHaveTextContent('USD 0');
	expect(fetchMock).not.toHaveBeenCalled();
});

it('does not fetch or invent a supplier mapping for an unconfigured offer', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Details, { offerId: null, quantity: 1000, fx: 1500 });
	await expect
		.element(
			page.getByText(
				'No saved supplier details are available for this offer yet. Your price draft is unchanged.'
			)
		)
		.toBeVisible();
	expect(fetchMock).not.toHaveBeenCalled();
});

it('can retry a failed GET without submitting or saving any settings', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ success: false, error: 'Connection unavailable' }, { status: 503 })
		)
		.mockResolvedValueOnce(Response.json({ success: true, data: supplierDetailsFixture() }));
	vi.stubGlobal('fetch', fetchMock);
	render(Details, { offerId: 'offer', quantity: 1000, fx: 1500 });
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Supplier details could not load. Your pricing edits are kept.');
	await page.getByRole('button', { name: 'Try loading again' }).click();
	await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
	await expect
		.element(page.getByRole('region', { name: 'SMM Raja supplier records' }))
		.toBeVisible();
	expect(fetchMock).toHaveBeenCalledTimes(2);
	for (const [, init] of fetchMock.mock.calls) expect(init).not.toHaveProperty('method');
});

it('refreshes the saved details without saving settings or treating old records as fresh', async () => {
	const updated = supplierDetailsFixture();
	updated.providers[0].services[0].serviceId = 'NEW-SAVED';
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ success: true, data: supplierDetailsFixture() }))
		.mockResolvedValueOnce(Response.json({ success: true, data: updated }));
	vi.stubGlobal('fetch', fetchMock);
	render(Details, { offerId: 'offer', quantity: 1000, fx: 1500 });
	await expect
		.element(page.getByRole('region', { name: 'SMM Raja supplier records' }))
		.toHaveTextContent('#DEMO');
	await page.getByRole('button', { name: 'Refresh saved details' }).click();
	await expect
		.element(page.getByRole('region', { name: 'SMM Raja supplier records' }))
		.toHaveTextContent('#NEW-SAVED');
	expect(fetchMock).toHaveBeenCalledTimes(2);
	for (const [, options] of fetchMock.mock.calls) {
		expect(options).toMatchObject({ cache: 'no-store' });
		expect(options).not.toHaveProperty('method');
	}
});

it('rejects a mismatched response instead of showing another offer’s supplier details', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValue(
				Response.json({ success: true, data: supplierDetailsFixture('another-offer') })
			)
	);
	render(Details, { offerId: 'offer', quantity: 1000, fx: 1500 });
	await expect.element(page.getByRole('alert')).toHaveTextContent('Your pricing edits are kept.');
	expect(page.getByRole('region', { name: 'SMM Raja supplier records' }).query()).toBeNull();
});

it('aborts an in-flight read when details close', async () => {
	let signal: AbortSignal | undefined;
	const fetchMock = vi.fn((_url: string, options: RequestInit) => {
		signal = options.signal as AbortSignal;
		return new Promise<Response>((_resolve, reject) =>
			signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
		);
	});
	vi.stubGlobal('fetch', fetchMock);
	const view = render(Details, { offerId: 'offer', quantity: 1000, fx: 1500 });
	await expect
		.element(page.getByRole('status'))
		.toHaveTextContent('Loading saved supplier details');
	await view.unmount();
	expect(signal?.aborted).toBe(true);
});
