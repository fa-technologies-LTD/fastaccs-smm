import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saleOfferFixture } from '$lib/server/boosting-sale-readiness-fixtures';
vi.mock('$lib/services/boosting-pricing', () => ({
	getBoostingPricingConfig: async () => ({ usdNgnRate: 1500 })
}));

const mocks = vi.hoisted(() => ({ categories: vi.fn(), offers: vi.fn(), maintenance: vi.fn() }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findMany: mocks.categories },
		boostCustomerOffer: { findMany: mocks.offers }
	}
}));
vi.mock('$lib/services/exact-preview', () => ({
	EXACT_PREVIEW_RESERVATION_KEY: 'reservation',
	EXACT_PREVIEW_SOURCE: 'test',
	getExactPreviewProfileUrl: vi.fn(),
	getExactPreviewScreenshotUrl: vi.fn(),
	releaseExpiredExactPreviewReservations: mocks.maintenance
}));
import { POST } from './+server';

const categoryId = '11111111-1111-4111-8111-111111111111';
const offerId = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
	vi.clearAllMocks();
	mocks.categories.mockResolvedValue([
		{
			id: categoryId,
			name: 'TikTok Custom Comments',
			slug: 'tiktok-custom-comments',
			categoryType: 'boosting_service',
			isActive: true,
			metadata: { boosting_platform: 'tiktok', boosting_action_type: 'custom_comments' },
			parent: null
		}
	]);
	mocks.offers.mockResolvedValue([
		{
			...saleOfferFixture(),
			id: offerId,
			categoryId,
			customerName: 'Premium',
			platform: 'tiktok',
			outcome: 'custom_comments',
			minQuantity: 10,
			maxQuantity: 500,
			stepQuantity: 1,
			pricePerStepNgn: 10.5,
			routes: [
				{
					...saleOfferFixture().routes[0],
					minimumQuantity: 1,
					verifiedSignals: [],
					providerService: {
						...saleOfferFixture().routes[0].providerService,
						name: 'TikTok Custom Comments',
						category: 'TikTok Custom Comments',
						providerType: 'Custom Comments',
						outcomes: ['custom_comments'],
						minQuantity: 1
					}
				}
			]
		}
	]);
});

async function refresh(comments: unknown, quantity: number) {
	const response = await POST({
		request: new Request('https://smm.fastaccs.com/api/cart/refresh', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: [
					{
						cartItemId: 'comment-line',
						tierId: categoryId,
						quantity: 1,
						boosting: {
							boostOfferId: offerId,
							targetUrl: 'https://www.tiktok.com/@test/video/7599586070874918162',
							boostQuantity: quantity,
							comments
						}
					}
				]
			})
		}),
		locals: {},
		url: new URL('https://smm.fastaccs.com/api/cart/refresh')
	} as never);
	expect(response.status).toBe(200);
	expect(mocks.maintenance).not.toHaveBeenCalled();
	return response.json();
}

describe('Boosting custom comments survive cart refresh', () => {
	it('returns only server-reviewed benefit labels with unchanged quantities and prices', async () => {
		const offers = await mocks.offers();
		offers[0].refillDays = 7;
		offers[0].routes[0].verifiedRefillDays = 7;
		offers[0].routes[0].providerService.refillAdvertised = true;
		mocks.offers.mockResolvedValue(offers);
		const result = await refresh(Array.from({ length: 10 }, () => 'Local test').join('\n'), 10);
		expect(result.data.items[0].tier.boostingConfig).toMatchObject({
			benefitLabel: '7-day refill',
			pricePerStep: 10.5,
			stepQuantity: 1
		});
		expect(result.data.items[0].boosting.boostQuantity).toBe(10);
		expect(JSON.stringify(result)).not.toContain('providerService');
	});
	it('removes a known-unavailable mapping and keeps supplier details private', async () => {
		const offers = await mocks.offers();
		offers[0].routes[0].providerService.providerState.projectedBalance = 0;
		mocks.offers.mockResolvedValue(offers);
		const result = await refresh(Array.from({ length: 10 }, () => 'Good product').join('\n'), 10);
		expect(result.data.items).toEqual([]);
		expect(result.data.messages[0]).toContain('currently unavailable');
		expect(JSON.stringify(result)).not.toContain('FIXTURE-NOT-REAL');
	});
	it('preserves normalized comments, quantity, offer and server-owned pricing', async () => {
		const lines = Array.from({ length: 10 }, (_, index) => `Lovely product ${index + 1}!`);
		const result = await refresh(` ${lines.join(' \r\n ')} \r\n\r\n`, 10);
		expect(result.data.messages).toEqual([]);
		expect(result.data.items).toHaveLength(1);
		expect(result.data.items[0].boosting).toMatchObject({
			comments: lines.join('\n'),
			boostQuantity: 10,
			boostOfferId: offerId
		});
		expect(result.data.items[0].tier.boostingConfig.pricePerStep).toBe(10.5);
	});

	it.each([undefined, ' ', 123, 'Bad\u0000comment', 'x'.repeat(501)])(
		'refuses missing or malformed text instead of losing or truncating it (%j)',
		async (comments) => {
			const result = await refresh(comments, 10);
			expect(result.data.items).toEqual([]);
			expect(result.data.messages.length).toBe(1);
		}
	);

	it('does not accept a quantity that differs from the actual comment count', async () => {
		const result = await refresh(Array.from({ length: 10 }, () => 'Lovely!').join('\n'), 100);
		expect(result.data.items).toEqual([]);
		expect(result.data.messages).toEqual([
			'Your comment count changed. Please add this option again.'
		]);
	});

	it('leaves ordinary Boosting lines unchanged and does not attach custom text', async () => {
		mocks.offers.mockResolvedValue([
			{
				...saleOfferFixture(),
				id: offerId,
				categoryId,
				customerName: 'Affordable',
				platform: 'tiktok',
				outcome: 'likes',
				minQuantity: 10,
				maxQuantity: 500,
				stepQuantity: 1,
				pricePerStepNgn: 5,
				routes: [
					{
						...saleOfferFixture().routes[0],
						minimumQuantity: 1,
						providerService: { ...saleOfferFixture().routes[0].providerService, minQuantity: 1 }
					}
				]
			}
		]);
		const result = await refresh(undefined, 10);
		expect(result.data.items).toHaveLength(1);
		expect(result.data.items[0].boosting).not.toHaveProperty('comments');
		expect(result.data.items[0].boosting.boostQuantity).toBe(10);
	});
});
