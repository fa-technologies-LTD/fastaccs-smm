import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findRolloutMarker: vi.fn(), mode: 'live' }));
vi.mock('$env/dynamic/private', () => ({
	env: {
		get BOOSTING_AUTOMATION_MODE() {
			return mocks.mode;
		}
	}
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		boostCustomerOffer: { findMany: mocks.findMany },
		microcopy: { findUnique: mocks.findRolloutMarker }
	}
}));

import { GET } from './+server';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.mode = 'live';
	mocks.findMany.mockResolvedValue([
		{
			categoryId: 'category-1',
			platform: 'instagram',
			outcome: 'followers',
			pricePerStepNgn: 100,
			routes: [
				{
					providerService: {
						name: 'Instagram Followers',
						category: 'Followers',
						providerType: 'Default',
						platforms: ['instagram'],
						unavailableAt: null
					}
				}
			],
			customerName: 'Stable followers',
			shortPromise: 'Lower drop risk.',
			expectationChips: ['More stable'],
			qualityTier: 'stable',
			displayOrder: 1
		}
	]);
	mocks.findRolloutMarker.mockResolvedValue(null);
});

describe('public live Boosting offer copy', () => {
	it.each(['shadow', 'pilot', ''])(
		'keeps offers offline when dispatch is not live (%s)',
		async (mode) => {
			mocks.mode = mode;
			const response = await GET({ setHeaders: vi.fn() } as never);
			expect(await response.json()).toMatchObject({
				managedRolloutActive: true,
				automationReady: false,
				data: []
			});
		}
	);
	it('returns only explicitly published active customer fields', async () => {
		const setHeaders = vi.fn();
		const response = await GET({ setHeaders } as never);
		const body = await response.json();

		expect(body).toMatchObject({
			success: true,
			managedRolloutActive: true,
			data: [{ categoryId: 'category-1' }]
		});
		expect(body.data[0].expectationChips).toEqual([]);
		expect(body.data[0]).not.toHaveProperty('routes');
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: 'live',
					category: { categoryType: 'boosting_service', isActive: true },
					routes: { some: { state: 'enabled', equivalenceApproved: true } }
				}),
				select: expect.not.objectContaining({
					routes: true,
					minimumMarginPercent: true,
					maximumSupplierCostNgn: true
				})
			})
		);
		expect(mocks.findMany.mock.calls[0]?.[0]?.select).toMatchObject({ maxQuantity: true });
		expect(setHeaders).toHaveBeenCalledWith(
			expect.objectContaining({ 'cache-control': expect.stringContaining('s-maxage=30') })
		);
	});
	it('a retained old route cannot keep an unavailable locked selection visible', async () => {
		const base = (await mocks.findMany())[0];
		mocks.findMany.mockResolvedValue([
			{
				...base,
				routingPolicy: 'locked',
				lockedRouteId: 'new',
				routes: [
					{ ...base.routes[0], id: 'old' },
					{
						...base.routes[0],
						id: 'new',
						providerService: { ...base.routes[0].providerService, unavailableAt: new Date() }
					}
				]
			}
		]);
		const body = await (await GET({ setHeaders: vi.fn() } as never)).json();
		expect(body.data).toEqual([]);
	});
	it('never exposes the selected internal route identifiers', async () => {
		const base = (await mocks.findMany())[0];
		mocks.findMany.mockResolvedValue([
			{
				...base,
				routingPolicy: 'locked',
				lockedRouteId: 'chosen',
				routes: [{ ...base.routes[0], id: 'chosen' }]
			}
		]);
		const body = await (await GET({ setHeaders: vi.fn() } as never)).json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0]).not.toHaveProperty('lockedRouteId');
		expect(body.data[0]).not.toHaveProperty('routingPolicy');
	});
	it.each([
		['likes', 'TikTok Live Likes', 'TikTok Live Likes', 'Default'],
		['likes', 'TikTok Likes', 'TikTok Likes', 'Subscriptions'],
		['views', 'TikTok Impressions + Reach', 'TikTok Views', 'Default']
	])(
		'hides a stale %s route without falling back to the old storefront',
		async (outcome, name, category, providerType) => {
			mocks.findMany.mockResolvedValue([
				{
					platform: 'tiktok',
					outcome,
					routes: [
						{
							providerService: {
								name,
								category,
								providerType,
								platforms: ['tiktok'],
								unavailableAt: null
							}
						}
					]
				}
			]);
			const response = await GET({ setHeaders: vi.fn() } as never);
			expect(await response.json()).toMatchObject({ managedRolloutActive: true, data: [] });
		}
	);
});
