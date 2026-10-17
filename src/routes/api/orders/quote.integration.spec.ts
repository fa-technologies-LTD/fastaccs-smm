import { beforeEach, expect, it, vi } from 'vitest';
import { saleOfferFixture } from '$lib/server/boosting-sale-readiness-fixtures';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), findOrder: vi.fn(), buckets: vi.fn() }));
vi.mock('$lib/services/store-credit', async (original) => ({
	...(await original<typeof import('$lib/services/store-credit')>()),
	getStoreCreditBuckets: mocks.buckets
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		order: { findUnique: mocks.findOrder },
		category: {
			findMany: async () => [
				{
					id: 'category',
					name: 'TikTok Likes',
					categoryType: 'boosting_service',
					isActive: true,
					metadata: {}
				}
			]
		},
		boostCustomerOffer: {
			findMany: async () => [
				{
					...saleOfferFixture(),
					id: 'offer',
					categoryId: 'category',
					pricePerStepNgn: 500,
					minQuantity: 200,
					stepQuantity: 200
				}
			]
		},
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
vi.mock('$lib/services/boosting-pricing', () => ({
	getBoostingPricingConfig: async () => ({ usdNgnRate: 1500 })
}));
import { POST } from './+server';
beforeEach(() => {
	vi.clearAllMocks();
	mocks.findOrder.mockResolvedValue(null);
	mocks.buckets.mockResolvedValue({ refundAvailable: 0, earnedAvailable: 0, totalAvailable: 0 });
	mocks.transaction.mockRejectedValue(new Error('NO_WRITE_TEST_BOUNDARY'));
});
it('stops rather than silently removing credit when the credit balance cannot be read', async () => {
	mocks.buckets.mockRejectedValue(new Error('fixture database read failed'));
	expect(await (await checkout({ useStoreCredit: true })).json()).toMatchObject({
		code: 'CREDIT_UNAVAILABLE'
	});
	expect(mocks.transaction).not.toHaveBeenCalled();
});
async function checkout(extra: Record<string, unknown> = {}) {
	return POST({
		request: new Request('https://local.invalid/api/orders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutKey: 'fixture-quote-consent',
				paymentMethod: 'monnify',
				totalAmount: 1000,
				items: [
					{
						categoryId: 'category',
						boostOfferId: 'offer',
						quantity: 1,
						boostQuantity: 400,
						price: 1,
						boostTargetUrl: 'https://www.tiktok.com/@test/video/7599586070874918162'
					}
				],
				...extra
			})
		}),
		locals: { user: { id: 'buyer', email: 'buyer@example.invalid', emailVerified: true } },
		url: new URL('https://local.invalid/api/orders')
	} as never);
}
it('rejects a changed display total before any financial transaction', async () => {
	const response = await checkout({ totalAmount: 500 });
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({
		code: 'CHECKOUT_PRICE_CHANGED',
		quote: { total: 1000, payable: 1000 }
	});
	expect(mocks.transaction).not.toHaveBeenCalled();
});
it('rejects stale tender and individual-line consent even when totals match', async () => {
	const quote = {
		subtotal: 1000,
		discount: 0,
		total: 1000,
		creditApplied: 500,
		payable: 500,
		linePrices: [1000]
	};
	expect((await (await checkout({ acceptedQuote: quote })).json()).code).toBe(
		'CHECKOUT_PRICE_CHANGED'
	);
	expect(
		(
			await (
				await checkout({
					acceptedQuote: { ...quote, creditApplied: 0, payable: 1000, linePrices: [1] }
				})
			).json()
		).code
	).toBe('CHECKOUT_PRICE_CHANGED');
	expect(mocks.transaction).not.toHaveBeenCalled();
});
it('allows acknowledged prices while ignoring forged item prices', async () => {
	const response = await checkout({
		acceptedQuote: {
			subtotal: 1000,
			discount: 0,
			total: 1000,
			creditApplied: 0,
			payable: 1000,
			linePrices: [1000]
		}
	});
	expect(await response.json()).toMatchObject({ error: 'NO_WRITE_TEST_BOUNDARY' });
	expect(mocks.transaction).toHaveBeenCalledOnce();
});
it('resumes an existing payment before re-pricing the same accepted request', async () => {
	mocks.findOrder.mockResolvedValue({
		id: 'existing',
		userId: 'buyer',
		status: 'pending_payment',
		paymentStatus: 'pending',
		paymentMethod: 'monnify',
		paymentCheckoutUrl: 'https://checkout.invalid/existing',
		paymentExpiresAt: new Date(Date.now() + 60000),
		totalAmount: 500
	});
	const response = await checkout({ totalAmount: 500 });
	expect(await response.json()).toMatchObject({
		success: true,
		resumed: true,
		orderId: 'existing'
	});
	expect(mocks.transaction).not.toHaveBeenCalled();
});
