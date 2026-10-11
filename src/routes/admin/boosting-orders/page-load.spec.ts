import { expect, it, vi } from 'vitest';
import { load } from './+page';

it('loads the dedicated reporting endpoint alongside the order queue, without any writes', async () => {
	const analytics = { overall: { orders: 2, items: 3 } };
	const fetch = vi.fn(async (input: RequestInfo | URL) =>
		Response.json({
			success: true,
			data: String(input).endsWith('/analytics') ? analytics : [],
			meta: { totalItems: 3 }
		})
	);
	const result = (await load({ fetch } as never)) as Record<string, unknown>;
	expect(result.analytics).toEqual(analytics);
	expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual([
		'/api/admin/boosting-orders?status=active&sort=newest&page=1&pageSize=25',
		'/api/admin/boosting-orders/analytics'
	]);
});
it('keeps order management available when financial reporting cannot load', async () => {
	const fetch = vi.fn(async (input: RequestInfo | URL) =>
		String(input).endsWith('/analytics')
			? Response.json({ success: false }, { status: 503 })
			: Response.json({ success: true, data: [{ id: 'item' }], meta: { totalItems: 1 } })
	);
	const result = (await load({ fetch } as never)) as Record<string, unknown>;
	expect(result.items).toEqual([{ id: 'item' }]);
	expect(result.analytics).toBeNull();
	expect(result.analyticsError).toContain('Order management is still available');
});
