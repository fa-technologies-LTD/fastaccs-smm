import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({
	env: {
		BOOSTING_USD_NGN_RATE: '1600',
		BOOSTING_CURRENCY_BUFFER_PERCENT: '5',
		BOOSTING_RELIABILITY_FLOOR: '0.8',
		BOOSTING_BALANCE_SAFETY_USD: '5',
		BOOSTING_CATALOG_MAX_AGE_MINUTES: '90',
		BOOSTING_BALANCE_MAX_AGE_MINUTES: '45'
	}
}));

import { runBoostingShadowRouter } from './shadow-router';

const now = new Date('2026-09-12T10:00:00.000Z');

function providerService(provider: 'smm_raja' | 'bulk_follows', rate: number, serviceId: string) {
	return {
		id: `${provider}-${serviceId}`,
		provider,
		serviceId,
		name: 'Instagram followers',
		category: 'Instagram',
		description: null,
		providerType: 'Default',
		ratePerThousand: new Prisma.Decimal(rate),
		minQuantity: 100,
		maxQuantity: 100_000,
		refillAdvertised: true,
		cancelAdvertised: false,
		dripfeedAdvertised: false,
		platforms: ['instagram'],
		outcomes: ['followers'],
		targetType: 'profile',
		qualitySignals: ['stable'],
		catalogueStatus: 'ready_for_review',
		fingerprint: `${provider}-fingerprint`,
		lastSeenAt: new Date('2026-09-12T09:50:00.000Z'),
		providerState: {
			enabled: true,
			circuitOpen: false,
			currency: 'USD',
			balance: new Prisma.Decimal(100),
			projectedBalance: new Prisma.Decimal(100),
			lastCatalogueSuccessAt: new Date('2026-09-12T09:45:00.000Z'),
			lastBalanceSuccessAt: new Date('2026-09-12T09:45:00.000Z')
		}
	};
}

function candidate(targetUrl = 'https://www.instagram.com/fastaccs') {
	return {
		id: 'order-item-1',
		boostTargetUrl: targetUrl,
		boostQuantity: 1000,
		totalPrice: new Prisma.Decimal(5000),
		createdAt: new Date('2026-09-12T09:00:00.000Z'),
		order: {
			id: 'order-1',
			paymentStatus: 'paid',
			paidAt: new Date('2026-09-12T09:00:00.000Z'),
			subtotal: new Prisma.Decimal(5000),
			discountAmount: new Prisma.Decimal(0)
		},
		category: {
			boostCustomerOffer: {
				id: 'offer-1',
				platform: 'instagram',
				outcome: 'followers',
				targetType: 'profile',
				audienceTag: null,
				qualityTier: 'stable',
				customerName: 'More stable followers',
				shortPromise: 'Better tested retention.',
				expectationChips: ['More stable'],
				minQuantity: 1000,
				requiredVerifiedSignals: ['stable'],
				refillDays: 30,
				minimumMarginPercent: new Prisma.Decimal(30),
				normalCostTargetNgn: new Prisma.Decimal(1800),
				maximumSupplierCostNgn: new Prisma.Decimal(3000),
				attemptCap: 2,
				routingPolicy: 'automatic',
				preferredRouteId: null,
				lockedRouteId: null,
				routes: [
					{
						id: 'route-cheap-shadow',
						state: 'shadow',
						equivalenceApproved: true,
						verifiedSignals: ['stable'],
						audienceTags: [],
						verifiedRefillDays: 30,
						reliabilityScore: new Prisma.Decimal(0.9),
						reliabilityObservations: 20,
						maximumPilotQuantity: 5000,
						expectedRecoveryCostPercent: new Prisma.Decimal(5),
						providerService: providerService('smm_raja', 0.75, '101')
					},
					{
						id: 'route-live-expensive',
						state: 'enabled',
						equivalenceApproved: true,
						verifiedSignals: ['stable'],
						audienceTags: [],
						verifiedRefillDays: 30,
						reliabilityScore: new Prisma.Decimal(0.95),
						reliabilityObservations: 20,
						maximumPilotQuantity: 5000,
						expectedRecoveryCostPercent: new Prisma.Decimal(5),
						providerService: providerService('bulk_follows', 1.25, '202')
					}
				]
			}
		}
	};
}

function database() {
	return {
		orderItem: { findMany: mocks.findMany },
		boostFulfillment: { create: mocks.create }
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findMany.mockResolvedValue([candidate()]);
	mocks.create.mockResolvedValue({ id: 'fulfillment-1' });
});

describe('Boosting shadow router', () => {
	it('records the cheapest safe hypothetical route without changing or submitting the order', async () => {
		const result = await runBoostingShadowRouter({ database: database(), now });

		expect(result).toEqual({
			processed: 1,
			selected: 1,
			noSafeRoute: 0,
			invalidTarget: 0,
			targetReviewNeeded: 0,
			failed: 0
		});
		expect(mocks.create).toHaveBeenCalledOnce();
		const data = mocks.create.mock.calls[0][0].data;
		expect(data).toMatchObject({
			orderItemId: 'order-item-1',
			selectedRouteId: 'route-cheap-shadow',
			provider: 'smm_raja',
			status: 'manual_review',
			fulfillmentMode: 'shadow',
			attempts: {
				create: {
					type: 'shadow_route_decision',
					outcome: 'selected',
					routeId: 'route-cheap-shadow'
				}
			}
		});
		expect(data.supplierOrderId).toBeUndefined();
	});

	it('records a wrong-platform target for review and never selects a supplier route', async () => {
		mocks.findMany.mockResolvedValue([candidate('https://www.facebook.com/fastaccs')]);
		const result = await runBoostingShadowRouter({ database: database(), now });

		expect(result.invalidTarget).toBe(1);
		expect(mocks.create.mock.calls[0][0].data).toMatchObject({
			selectedRouteId: null,
			provider: null,
			status: 'manual_review',
			lastSafeErrorCategory: 'invalid_target'
		});
	});

	it('accepts an ambiguous official link for review without hypothetically submitting it', async () => {
		mocks.findMany.mockResolvedValue([candidate('https://instagram.com/share/example')]);
		const result = await runBoostingShadowRouter({ database: database(), now });

		expect(result.targetReviewNeeded).toBe(1);
		expect(mocks.create.mock.calls[0][0].data).toMatchObject({
			selectedRouteId: null,
			provider: null,
			lastSafeErrorCategory: 'target_review_needed'
		});
	});

	it('uses one collision key for the same target with harmless tracking differences', async () => {
		const first = candidate('https://www.instagram.com/fastaccs/?utm_source=snap');
		const second = candidate('https://instagram.com/fastaccs');
		second.id = 'order-item-2';
		mocks.findMany.mockResolvedValue([first, second]);

		await runBoostingShadowRouter({ database: database(), now });
		expect(mocks.create.mock.calls[0][0].data.targetKey).toBe(
			mocks.create.mock.calls[1][0].data.targetKey
		);
	});

	it('allocates order discounts to the item but does not confuse payment tender with revenue', async () => {
		const discounted = candidate();
		discounted.order.discountAmount = new Prisma.Decimal(1000);
		mocks.findMany.mockResolvedValue([discounted]);

		await runBoostingShadowRouter({ database: database(), now });
		expect(mocks.create.mock.calls[0][0].data.customerPriceNgn).toBe(4000);
	});

	it('scales the minimum-order cost ceiling to the quantity being evaluated', async () => {
		const largerOrder = candidate();
		largerOrder.boostQuantity = 5000;
		largerOrder.totalPrice = new Prisma.Decimal(25_000);
		largerOrder.order.subtotal = new Prisma.Decimal(25_000);
		mocks.findMany.mockResolvedValue([largerOrder]);

		await runBoostingShadowRouter({ database: database(), now });
		expect(mocks.create.mock.calls[0][0].data.maximumSupplierCostNgn).toBe(15_000);
	});

	it('fails closed if a supplier account stops reporting USD', async () => {
		const changedCurrency = candidate();
		for (const route of changedCurrency.category.boostCustomerOffer.routes) {
			route.providerService.providerState.currency = 'NGN';
		}
		mocks.findMany.mockResolvedValue([changedCurrency]);

		const result = await runBoostingShadowRouter({ database: database(), now });
		expect(result.noSafeRoute).toBe(1);
		expect(mocks.create.mock.calls[0][0].data.selectedRouteId).toBeNull();
	});

	it('does not choose a route using a stale cached supplier balance', async () => {
		const staleBalance = candidate();
		for (const route of staleBalance.category.boostCustomerOffer.routes) {
			route.providerService.providerState.lastBalanceSuccessAt = new Date(
				'2026-09-12T08:00:00.000Z'
			);
		}
		mocks.findMany.mockResolvedValue([staleBalance]);

		const result = await runBoostingShadowRouter({ database: database(), now });
		expect(result.noSafeRoute).toBe(1);
		const projections = mocks.create.mock.calls[0][0].data.attempts.create.safeSummary.projections;
		expect(projections[0].reasons).toContain('balance_stale');
	});

	it('is a no-op when there are no unmapped paid items', async () => {
		mocks.findMany.mockResolvedValue([]);
		const result = await runBoostingShadowRouter({ database: database(), now, limit: 10_000 });

		expect(result.processed).toBe(0);
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.findMany.mock.calls[0][0].take).toBe(100);
	});
});
