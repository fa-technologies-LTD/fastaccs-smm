import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/store-credit', () => ({
	getStoreCreditBuckets: async () => ({
		totalAvailable: 2_500,
		refundAvailable: 1_000,
		earnedAvailable: 500,
		promoAvailable: 1_000,
		promo: [{ campaign: 'refer_win', available: 1_000, nextExpiresAt: '2026-11-19T10:00:00.000Z' }]
	})
}));
vi.mock('$lib/services/promotions', () => ({
	getFirstOrderOffer: async () => ({ label: '10% off your first account order' })
}));
vi.mock('$lib/services/promo-campaigns', () => ({
	getPromoCaps: async () => ({ refer_win: 50 })
}));

import { GET } from './+server';

const call = (user: unknown) =>
	GET({ locals: { user }, setHeaders: () => {} } as never) as Promise<Response>;

describe('cart rewards hint', () => {
	it('gives a signed-in buyer the first-order offer and their credit balances', async () => {
		const body = await (await call({ id: 'u1' })).json();
		expect(body.lines).toEqual(['10% off your first account order: one tap at checkout']);
		expect(body.credit).toEqual({
			refundAvailable: 1_000,
			earnedAvailable: 500,
			promo: [
				{ campaign: 'refer_win', available: 1_000, nextExpiresAt: '2026-11-19T10:00:00.000Z' }
			],
			promoCaps: { refer_win: 50 },
			promoNote: '₦1,000 promo credit, use by 19 Nov'
		});
	});

	it('says nothing to signed-out visitors', async () => {
		expect(await (await call(null)).json()).toEqual({ lines: [], credit: null });
	});
});
