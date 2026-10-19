import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saleOfferFixture } from '$lib/server/boosting-sale-readiness-fixtures';
vi.mock('$lib/services/boosting-pricing', () => ({
	getBoostingPricingConfig: async () => ({ usdNgnRate: 1500 })
}));

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
			...saleOfferFixture(),
			categoryId: 'category-1',
			platform: 'instagram',
			outcome: 'followers',
			targetType: 'profile',
			pricePerStepNgn: 100,
			routes: [
				{
					...saleOfferFixture().routes[0],
					targetType: 'profile',
					providerService: {
						...saleOfferFixture().routes[0].providerService,
						name: 'Instagram Followers',
						category: 'Followers',
						providerType: 'Default',
						platforms: ['instagram'],
						outcomes: ['followers'],
						targetType: 'profile',
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
	it('includes a reviewed benefit without revealing suppliers or numbering options', async () => {
		const base = (await mocks.findMany())[0];
		base.refillDays = 30;
		base.routes[0].verifiedRefillDays = 30;
		base.routes[0].providerService.refillAdvertised = true;
		mocks.findMany.mockResolvedValue([base, { ...base, id: 'other', refillDays: null }]);
		const body = await (await GET({ setHeaders: vi.fn() } as never)).json();
		expect(body.data[0].benefitLabel).toBe('30-day refill');
		expect(JSON.stringify(body)).not.toMatch(/Standard option|providerService|verifiedSignals/);
	});
	it.each(['funds', 'stale', 'refill', 'approval', 'missing'])(
		'does not sell a known unavailable offer: %s',
		async (issue) => {
			const base = (await mocks.findMany())[0];
			if (issue === 'funds') base.routes[0].providerService.providerState.projectedBalance = 0;
			if (issue === 'stale')
				base.routes[0].providerService.providerState.lastBalanceSuccessAt = new Date(0);
			if (issue === 'refill') base.refillDays = 30;
			if (issue === 'approval') base.routes[0].equivalenceApproved = false;
			if (issue === 'missing') base.routes = [];
			mocks.findMany.mockResolvedValue([base]);
			expect(await (await GET({ setHeaders: vi.fn() } as never)).json()).toMatchObject({
				managedRolloutActive: true,
				data: []
			});
		}
	);
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
				include: expect.objectContaining({ routes: expect.any(Object) })
			})
		);
		expect(setHeaders).toHaveBeenCalledWith(
			expect.objectContaining({ 'cache-control': 'no-store' })
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
					...saleOfferFixture(),
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
