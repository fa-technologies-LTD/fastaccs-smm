import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	categories: vi.fn(),
	offers: vi.fn(),
	transaction: vi.fn(),
	marker: vi.fn(),
	mode: 'live'
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		order: { findUnique: vi.fn().mockResolvedValue(null) },
		category: { findMany: mocks.categories },
		boostCustomerOffer: { findMany: mocks.offers },
		microcopy: { findUnique: mocks.marker },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: vi.fn().mockResolvedValue(true),
	getMinimumOrderValueSetting: vi.fn().mockResolvedValue(0)
}));
vi.mock('$lib/helpers/checkout-control.server', () => ({
	isNewCheckoutInitializationDisabled: () => false
}));
vi.mock('$lib/server/boosting-providers/fulfillment-worker', () => ({
	getBoostAutomationMode: () => mocks.mode
}));
import { POST } from './+server';

const offer = {
	id: 'custom-offer',
	categoryId: 'custom-category',
	platform: 'tiktok',
	outcome: 'custom_comments',
	minQuantity: 10,
	maxQuantity: 500,
	stepQuantity: 1,
	pricePerStepNgn: 10.5,
	routes: [
		{
			providerService: {
				name: 'TikTok Custom Comments',
				category: 'TikTok Comments',
				providerType: 'Custom Comments',
				platforms: ['tiktok'],
				unavailableAt: null
			}
		}
	]
};
async function checkout(
	comments: unknown,
	quantity: number,
	outcome = 'custom_comments',
	options: { omitOffer?: boolean; service?: Record<string, unknown> } = {}
) {
	mocks.categories.mockResolvedValue([
		{
			id: offer.categoryId,
			name: 'Custom comments',
			categoryType: 'boosting_service',
			isActive: true,
			metadata: { boosting_platform: 'tiktok', boosting_action_type: outcome }
		}
	]);
	mocks.offers.mockResolvedValue([
		{
			...offer,
			outcome,
			routes: options.service ? [{ providerService: options.service }] : offer.routes
		}
	]);
	return POST({
		request: new Request('https://smm.fastaccs.com/api/orders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutKey: 'custom-comment-contract-check',
				paymentMethod: 'monnify',
				items: [
					{
						categoryId: offer.categoryId,
						quantity: 1,
						boostOfferId: options.omitOffer ? undefined : offer.id,
						boostQuantity: quantity,
						boostTargetUrl: 'https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162',
						boostComments: comments
					}
				]
			})
		}),
		locals: {
			user: {
				id: 'test-buyer',
				email: 'buyer@example.com',
				emailVerified: true,
				userType: 'REGISTERED'
			}
		},
		url: new URL('https://smm.fastaccs.com/api/orders')
	} as never);
}

describe('Boosting checkout input contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mode = 'live';
	});
	it('refuses a stale managed cart while dispatch is in shadow mode', async () => {
		mocks.mode = 'shadow';
		const response = await checkout(Array.from({ length: 100 }, () => 'Lovely!').join('\n'), 100);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'Boosting is being updated. Please try again soon.'
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it('rejects a legacy category-only cart after the managed storefront cutover', async () => {
		mocks.marker.mockResolvedValue({ value: 'true', isActive: true });
		const response = await checkout(undefined, 100, 'likes', { omitOffer: true });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'Choose an available Boosting option again.'
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it.each([
		{ platforms: ['instagram'], unavailableAt: null },
		{ platforms: ['tiktok'], unavailableAt: new Date('2026-10-09') }
	])('rejects an unavailable or cross-platform cached route before payment: %j', async (state) => {
		const response = await checkout(undefined, 100, 'likes', {
			service: { name: 'TikTok Likes', category: 'Likes', providerType: 'Default', ...state }
		});
		expect(response.status).toBe(409);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it('rejects a forged count before reserving stock, credit or payment', async () => {
		const response = await checkout('Lovely!\nGreat!', 100);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'Comment count does not match this service.'
		});
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it.each([null, {}, '', 'x'.repeat(30001)])(
		'rejects invalid custom text before financial writes: %s',
		async (text) => {
			const response = await checkout(text, 10);
			expect(response.status).toBe(400);
			expect(mocks.transaction).not.toHaveBeenCalled();
		}
	);
	it('cannot send custom text through an ordinary comment choice', async () => {
		const response = await checkout('Lovely!', 10, 'comments');
		expect(response.status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it('rejects fractional quantities instead of silently rounding a posted count', async () => {
		const response = await checkout(Array.from({ length: 10 }, () => 'Lovely!').join('\n'), 10.8);
		expect(response.status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
	it('rejects subscription routes even when cached outcome says likes', async () => {
		mocks.categories.mockResolvedValue([
			{
				id: offer.categoryId,
				name: 'Likes',
				categoryType: 'boosting_service',
				isActive: true,
				metadata: {}
			}
		]);
		mocks.offers.mockResolvedValue([
			{
				...offer,
				outcome: 'likes',
				routes: [
					{
						providerService: {
							name: 'TikTok Likes',
							category: 'TikTok Likes',
							providerType: 'Subscriptions',
							platforms: ['tiktok'],
							unavailableAt: null
						}
					}
				]
			}
		]);
		const response = await POST({
			request: new Request('https://smm.fastaccs.com/api/orders', {
				method: 'POST',
				body: JSON.stringify({
					checkoutKey: 'subscription-guard-check',
					items: [
						{
							categoryId: offer.categoryId,
							quantity: 1,
							boostOfferId: offer.id,
							boostQuantity: 10,
							boostTargetUrl: 'https://www.tiktok.com/@faworldwidegifting/video/7599586070874918162'
						}
					]
				})
			}),
			locals: { user: { id: 'test-buyer', email: 'buyer@example.com', emailVerified: true } },
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);
		expect(response.status).toBe(409);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});
