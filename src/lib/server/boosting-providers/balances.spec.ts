import { expect, it, vi } from 'vitest';
import { readBoostSupplierBalances } from './balances';
import type { BoostProviderReadClient } from './types';

function client(id: 'smm_raja' | 'bulk_follows' = 'smm_raja'): BoostProviderReadClient {
	return {
		id,
		label: id,
		isConfigured: vi.fn(() => true),
		listServices: vi.fn(),
		getBalance: vi.fn(async () => ({ provider: id, amount: 0, currency: 'USD' }))
	};
}
it('reads zero balances without fetching catalogues, repricing or writing records', async () => {
	const source = client();
	expect(await readBoostSupplierBalances(undefined, [source])).toEqual([
		{
			id: 'smm_raja',
			label: 'smm_raja',
			configured: true,
			balance: 0,
			currency: 'USD',
			checkedAt: expect.any(String),
			error: null
		}
	]);
	expect(source.getBalance).toHaveBeenCalledOnce();
	expect(source.listServices).not.toHaveBeenCalled();
});
it('refreshes only the requested supplier', async () => {
	const first = client(),
		second = client('bulk_follows');
	const result = await readBoostSupplierBalances('bulk_follows', [first, second]);
	expect(result.map((item) => item.id)).toEqual(['bulk_follows']);
	expect(first.getBalance).not.toHaveBeenCalled();
	expect(second.getBalance).toHaveBeenCalledOnce();
});
it('does not call unconfigured suppliers and isolates failures without leaking upstream errors', async () => {
	const first = client(),
		second = client('bulk_follows');
	vi.mocked(first.isConfigured).mockReturnValue(false);
	vi.mocked(second.getBalance).mockRejectedValue(new Error('secret-key'));
	const result = await readBoostSupplierBalances(undefined, [first, second]);
	expect(first.getBalance).not.toHaveBeenCalled();
	expect(result[0]).toMatchObject({ configured: false, balance: null, error: null });
	expect(result[1]).toMatchObject({
		balance: null,
		checkedAt: null,
		error: 'Balance could not refresh. Try again.'
	});
	expect(JSON.stringify(result)).not.toContain('secret-key');
});
it('fails safely on malformed upstream balances', async () => {
	const source = client();
	vi.mocked(source.getBalance).mockResolvedValue({
		provider: 'smm_raja',
		amount: NaN,
		currency: 'USD'
	});
	expect((await readBoostSupplierBalances(undefined, [source]))[0]).toMatchObject({
		balance: null,
		error: expect.any(String)
	});
});
