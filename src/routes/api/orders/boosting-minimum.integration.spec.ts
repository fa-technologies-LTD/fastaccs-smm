import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saleOfferFixture } from '$lib/server/boosting-sale-readiness-fixtures';
vi.mock('$lib/services/boosting-pricing', () => ({
	getBoostingPricingConfig: async () => ({ usdNgnRate: 1500 })
}));

const mocks = vi.hoisted(() => ({ categories: vi.fn(), offers: vi.fn(), transaction: vi.fn() }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		order: { findUnique: vi.fn().mockResolvedValue(null) },
		category: { findMany: mocks.categories },
		boostCustomerOffer: { findMany: mocks.offers },
		boostFulfillment: { findFirst: async () => null },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: async () => true,
	getMinimumOrderValueSetting: async () => 0
}));
vi.mock('$lib/helpers/checkout-control.server', () => ({
	isNewCheckoutInitializationDisabled: () => false
}));
vi.mock('$lib/server/boosting-providers/fulfillment-worker', () => ({
	getBoostAutomationMode: () => 'live'
}));
import { POST } from './+server';

async function checkout(quantities: number[]) {
	return POST({
		request: new Request('https://smm.fastaccs.com/api/orders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutKey: 'minimum-test',
				paymentMethod: 'monnify',
				totalAmount: quantities.reduce(
					(sum, quantity) => sum + Math.ceil(((quantity / 100) * 125) / 50) * 50,
					0
				),
				items: quantities.map((boostQuantity, i) => ({
					categoryId: `category-${i}`,
					boostOfferId: `offer-${i}`,
					quantity: 1,
					boostQuantity,
					price: 99999,
					boostTargetUrl: `https://www.tiktok.com/@test/video/${7599586070874918100n + BigInt(i)}`
				}))
			})
		}),
		locals: {
			user: { id: 'fixture-buyer', email: 'fixture@invalid.example', emailVerified: true }
		},
		url: new URL('https://smm.fastaccs.com/api/orders')
	} as never);
}

describe('server-authoritative combined Boosting checkout minimum', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.categories.mockResolvedValue(
			[0, 1].map((i) => ({
				id: `category-${i}`,
				name: 'TikTok Likes',
				categoryType: 'boosting_service',
				isActive: true,
				metadata: {}
			}))
		);
		mocks.offers.mockResolvedValue(
			[0, 1].map((i) => ({
				...saleOfferFixture(),
				id: `offer-${i}`,
				categoryId: `category-${i}`,
				platform: 'tiktok',
				outcome: 'likes',
				minQuantity: 100,
				maxQuantity: 10000,
				stepQuantity: 100,
				pricePerStepNgn: 125,
				routes: [
					{
						...saleOfferFixture().routes[0],
						providerService: {
							...saleOfferFixture().routes[0].providerService,
							name: 'TikTok Likes',
							category: 'TikTok Likes',
							providerType: 'Default',
							platforms: ['tiktok'],
							unavailableAt: null
						}
					}
				]
			}))
		);
		// Deliberately stop at the financial boundary. This suite must never create an
		// order, reserve credit, or contact a gateway/provider; only validate the guard.
		mocks.transaction.mockRejectedValue(new Error('Fixture financial boundary reached.'));
	});
	afterEach(() => vi.restoreAllMocks());
	it.each(['funds', 'stale', 'locked', 'refill', 'quantity'])(
		'rejects a stale cart before order or payment writes: %s',
		async (issue) => {
			const offers = await mocks.offers();
			if (issue === 'funds') offers[0].routes[0].providerService.providerState.projectedBalance = 0;
			if (issue === 'stale')
				offers[0].routes[0].providerService.providerState.lastBalanceSuccessAt = new Date(0);
			if (issue === 'locked') offers[0].lockedRouteId = 'missing';
			if (issue === 'refill') offers[0].refillDays = 30;
			if (issue === 'quantity') offers[0].routes[0].maximumQuantity = 200;
			mocks.offers.mockResolvedValue(offers);
			expect((await checkout([400])).status).toBe(409);
			expect(mocks.transaction).not.toHaveBeenCalled();
		}
	);
	it('rejects an under-minimum cart using saved prices, ignoring forged client totals', async () => {
		const response = await checkout([200]);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: 'BOOSTING_MINIMUM_CHECKOUT',
			error: 'Add ₦250 more in Boosting to check out.'
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it.each([[400], [200, 200]])(
		'permits the ₦500 boundary for quantities %j',
		async (...quantities) => {
			const response = await checkout(quantities);
			expect(console.error).not.toHaveBeenCalled();
			expect(response.status).toBe(409); // Intentional no-write transaction sentinel.
			expect(await response.json()).toMatchObject({ error: 'Fixture financial boundary reached.' });
			expect(mocks.transaction).toHaveBeenCalledOnce();
		}
	);
});
