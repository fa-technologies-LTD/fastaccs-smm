import { page } from '@vitest/browser/context';
import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Balances from './BoostingSupplierBalances.svelte';
const records = (amount = 25.45) => [
	{
		id: 'smm_raja',
		label: 'SMM Raja',
		configured: true,
		balance: amount,
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
afterEach(() => vi.unstubAllGlobals());
it('makes each balance tappable and refreshes just that supplier with a read-only request', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records() } }))
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records(19) } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Balances);
	const first = page.getByRole('button', { name: 'Refresh SMM Raja balance' });
	await expect.element(first).toHaveTextContent('USD 25.45');
	await first.click();
	await expect.element(first).toHaveTextContent('USD 19.00');
	await expect
		.element(page.getByRole('button', { name: 'Refresh BulkFollows balance' }))
		.toHaveTextContent('USD 0.32');
	expect(fetchMock).toHaveBeenLastCalledWith(
		'/api/admin/boosting-suppliers/balances?provider=smm_raja',
		expect.objectContaining({ cache: 'no-store' })
	);
	for (const [, options] of fetchMock.mock.calls) expect(options).not.toHaveProperty('method');
});
it('marks the previous balance stale after failure and allows a retry instead of showing zero', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records() } }))
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValueOnce(Response.json({ success: true, data: { providers: records(0) } }));
	vi.stubGlobal('fetch', fetchMock);
	render(Balances);
	const first = page.getByRole('button', { name: 'Refresh SMM Raja balance' });
	await expect.element(first).toHaveTextContent('USD 25.45');
	await first.click();
	await expect
		.element(first)
		.toHaveTextContent('Previous balance · Couldn’t refresh · Tap to retry');
	await expect.element(first).toHaveTextContent('USD 25.45');
	await first.click();
	await expect.element(first).toHaveTextContent('USD 0.00');
	await expect.element(first).not.toHaveTextContent('Previous balance');
});
it('does not contact suppliers in the sample-only preview', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	render(Balances, { previewOnly: true });
	await expect
		.element(page.getByRole('button', { name: 'Refresh SMM Raja balance' }))
		.toBeDisabled();
	expect(fetchMock).not.toHaveBeenCalled();
});
