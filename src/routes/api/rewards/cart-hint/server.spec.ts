import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/store-credit', () => ({
	getStoreCreditBuckets: async () => ({
		totalAvailable: 2_500,
		promoAvailable: 1_000,
		promo: [{ campaign: 'refer_win', available: 1_000, nextExpiresAt: '2026-11-19T10:00:00.000Z' }]
	})
}));
vi.mock('$lib/services/promotions', () => ({
	getFirstOrderOffer: async () => ({ label: '10% off your first account order' })
}));

import { GET } from './+server';

const call = (user: unknown) =>
	GET({ locals: { user }, setHeaders: () => {} } as never) as Promise<Response>;

describe('cart rewards hint', () => {
	it('tells a signed-in buyer about credit and the first-order offer', async () => {
		const body = await (await call({ id: 'u1' })).json();
		expect(body.lines).toEqual([
			'₦2,500 store credit can be used at checkout (₦1,000 promo credit, use by 19 Nov)',
			'10% off your first account order: one tap at checkout'
		]);
	});

	it('says nothing to signed-out visitors', async () => {
		expect(await (await call(null)).json()).toEqual({ lines: [] });
	});
});
