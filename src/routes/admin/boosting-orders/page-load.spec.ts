import { expect, it, vi } from 'vitest';
import { load } from './+page';

it('opens a specific order search in All so completed history is still reachable', async () => {
	const fetch = vi.fn(async (_input: RequestInfo | URL) =>
		Response.json({ success: true, data: [], meta: { status: 'all', search: 'ORD-DEMO' } })
	);
	await load({ fetch, url: new URL('http://localhost/admin/boosting-orders?q=ORD-DEMO') } as never);
	expect(String(fetch.mock.calls[0][0])).toContain('status=all');
	expect(String(fetch.mock.calls[0][0])).toContain('q=ORD-DEMO');
});

it('loads only the order queue; Boosting Sales lives in Analytics', async () => {
	const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
		Response.json({ success: true, data: [{ id: 'item' }], meta: { totalItems: 1 } })
	);
	const result = (await load({ fetch } as never)) as Record<string, unknown>;
	expect(result.items).toEqual([{ id: 'item' }]);
	expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual([
		'/api/admin/boosting-orders?status=active&sort=newest&page=1&pageSize=25'
	]);
});
