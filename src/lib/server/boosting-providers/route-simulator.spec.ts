import { describe, expect, it } from 'vitest';
import { normalizeBoostProviderService } from './catalog-normalizer';
import {
	simulateBoostRoute,
	type BoostApprovedRoute,
	type BoostCustomerOfferEnvelope,
	type BoostProviderRuntimeState
} from './route-simulator';

const offer: BoostCustomerOfferEnvelope = {
	id: 'instagram-followers-stable',
	platform: 'instagram',
	outcome: 'followers',
	targetType: 'profile',
	quantity: 1000,
	customerPriceNgn: 5000,
	minimumMarginPercent: 30,
	maximumSupplierCostNgn: 3000,
	requiredVerifiedSignals: ['stable'],
	audienceTag: null,
	refillDays: 30,
	routingPolicy: 'automatic',
	preferredRouteId: null,
	lockedRouteId: null
};

const providers: BoostProviderRuntimeState[] = [
	{
		provider: 'smm_raja',
		enabled: true,
		circuitOpen: false,
		catalogFresh: true,
		balanceFresh: true,
		projectedBalanceUsd: 100,
		balanceSafetyUsd: 5
	},
	{
		provider: 'bulk_follows',
		enabled: true,
		circuitOpen: false,
		catalogFresh: true,
		balanceFresh: true,
		projectedBalanceUsd: 100,
		balanceSafetyUsd: 5
	}
];

function route(
	id: string,
	provider: 'smm_raja' | 'bulk_follows',
	rate: number,
	overrides: Partial<BoostApprovedRoute> = {}
): BoostApprovedRoute {
	return {
		id,
		service: normalizeBoostProviderService(provider, {
			service: `${provider}-${id}`,
			name: 'Instagram Followers',
			category: 'Instagram',
			rate,
			min: 100,
			max: 100000,
			refill: true
		}),
		state: 'enabled',
		equivalenceApproved: true,
		verifiedSignals: ['stable'],
		audienceTags: [],
		verifiedRefillDays: 30,
		reliabilityScore: 0.95,
		reliabilityObservations: 25,
		minimumReliabilityObservations: 10,
		maximumPilotQuantity: null,
		expectedRecoveryCostPercent: 5,
		...overrides
	};
}

function simulate(
	routes: BoostApprovedRoute[],
	offerOverrides: Partial<BoostCustomerOfferEnvelope> = {},
	providerOverrides: BoostProviderRuntimeState[] = providers
) {
	return simulateBoostRoute({
		offer: { ...offer, ...offerOverrides },
		routes,
		providers: providerOverrides,
		usdToNgn: 1600,
		currencyBufferPercent: 5,
		reliabilityFloor: 0.8
	});
}

describe('boost route simulator', () => {
	it('selects the cheapest eligible equivalent route', () => {
		const result = simulate([
			route('trusted-expensive', 'smm_raja', 1.25),
			route('trusted-cheap', 'bulk_follows', 0.75)
		]);

		expect(result.selectedRouteId).toBe('trusted-cheap');
		expect(result.selectionReason).toBe('lowest_safe_cost');
	});

	it('does not select a cheaper route that cannot satisfy the visible promise', () => {
		const result = simulate([
			route('safe', 'smm_raja', 1.25),
			route('cheap-but-different', 'bulk_follows', 0.25, {
				verifiedSignals: [],
				verifiedRefillDays: null
			})
		]);

		expect(result.selectedRouteId).toBe('safe');
		expect(result.projections.find((item) => item.routeId === 'cheap-but-different')).toMatchObject(
			{
				eligible: false,
				reasons: expect.arrayContaining(['missing_verified_promise', 'refill_mismatch'])
			}
		);
	});

	it('pauses selection when a supplier stops advertising the reviewed refill', () => {
		const changed = route('changed-refill', 'smm_raja', 0.75);
		changed.service.refillAdvertised = false;
		const result = simulate([changed]);

		expect(result.selectedRouteId).toBeNull();
		expect(result.projections[0].reasons).toContain('refill_mismatch');
	});

	it('honours preferred routing, then falls back only to another safe route', () => {
		const routes = [route('fallback', 'smm_raja', 0.75), route('preferred', 'bulk_follows', 1.25)];
		expect(
			simulate(routes, { routingPolicy: 'preferred', preferredRouteId: 'preferred' })
		).toMatchObject({ selectedRouteId: 'preferred', selectionReason: 'preferred_route' });

		const pausedPreferred = routes.map((item) =>
			item.id === 'preferred' ? { ...item, state: 'paused' as const } : item
		);
		expect(
			simulate(pausedPreferred, { routingPolicy: 'preferred', preferredRouteId: 'preferred' })
		).toMatchObject({ selectedRouteId: 'fallback', selectionReason: 'lowest_safe_cost' });
	});

	it('never silently falls back from a locked route', () => {
		const result = simulate(
			[
				route('backup', 'smm_raja', 0.75),
				route('locked', 'bulk_follows', 1.25, { state: 'paused' })
			],
			{ routingPolicy: 'locked', lockedRouteId: 'locked' }
		);

		expect(result.selectedRouteId).toBeNull();
		expect(result.selectionReason).toBe('no_safe_route');
		expect(result.projections.find((item) => item.routeId === 'backup')).toMatchObject({
			eligible: false,
			reasons: ['not_selected_by_policy']
		});
	});

	it('blocks routes that exceed quantity, balance, cost, margin, or measured reliability gates', () => {
		const lowBalance = providers.map((state) =>
			state.provider === 'smm_raja' ? { ...state, projectedBalanceUsd: 5 } : state
		);
		const result = simulate(
			[
				route('bad', 'smm_raja', 3, {
					reliabilityScore: 0.5,
					maximumPilotQuantity: 500
				})
			],
			{ maximumSupplierCostNgn: 1000 },
			lowBalance
		);

		expect(result.selectedRouteId).toBeNull();
		expect(result.projections[0].reasons).toEqual(
			expect.arrayContaining([
				'pilot_limit_exceeded',
				'below_reliability_floor',
				'insufficient_balance',
				'cost_cap_exceeded',
				'margin_floor_breached'
			])
		);
	});

	it('permits a small capped pilot before a new route has enough observations', () => {
		const result = simulate([
			route('pilot', 'smm_raja', 1, {
				reliabilityScore: 0,
				reliabilityObservations: 0,
				maximumPilotQuantity: 1000
			})
		]);

		expect(result.selectedRouteId).toBe('pilot');
	});

	it('uses the protected exchange rate without adding legacy hidden buffers', () => {
		const result = simulateBoostRoute({
			offer: {
				...offer,
				quantity: 500,
				customerPriceNgn: 10_000,
				minimumMarginPercent: 0,
				maximumSupplierCostNgn: 10_000
			},
			routes: [
				route('exact-cost', 'bulk_follows', 6.5, {
					expectedRecoveryCostPercent: 99,
					maximumPilotQuantity: 500
				})
			],
			providers,
			usdToNgn: 1500,
			currencyBufferPercent: 99,
			reliabilityFloor: 0.8
		});

		expect(result.projections[0].projectedSupplierCostNgn).toBe(4875);
	});

	it('can evaluate an approved shadow route without making it live-eligible', () => {
		const shadowRoute = route('shadow-candidate', 'smm_raja', 1, { state: 'shadow' });
		expect(simulate([shadowRoute]).selectedRouteId).toBeNull();

		const shadowResult = simulateBoostRoute({
			offer,
			routes: [shadowRoute],
			providers,
			usdToNgn: 1600,
			currencyBufferPercent: 5,
			reliabilityFloor: 0.8,
			executionMode: 'shadow'
		});
		expect(shadowResult.selectedRouteId).toBe('shadow-candidate');
	});

	it('fails closed when conversion or quantity inputs are invalid', () => {
		expect(() =>
			simulateBoostRoute({
				offer,
				routes: [],
				providers,
				usdToNgn: 0,
				currencyBufferPercent: 5,
				reliabilityFloor: 0.8
			})
		).toThrow('positive USD to NGN');
		expect(() => simulate([], { quantity: 0 })).toThrow('positive quantity');
	});
});
