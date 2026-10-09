import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
				totalAmount: 99999,
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
						providerService: {
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
