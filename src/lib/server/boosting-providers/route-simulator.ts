import type {
	BoostCatalogOutcome,
	BoostCatalogPlatform,
	BoostProviderId,
	BoostProviderService,
	BoostTargetType
} from './types';

export type BoostRouteState = 'enabled' | 'shadow' | 'paused';
export type BoostRoutingPolicy = 'automatic' | 'preferred' | 'locked';

export type BoostRouteExclusionReason =
	| 'not_approved'
	| 'route_not_enabled'
	| 'provider_unavailable'
	| 'catalog_stale'
	| 'balance_stale'
	| 'service_quarantined'
	| 'offer_mismatch'
	| 'target_mismatch'
	| 'missing_verified_promise'
	| 'audience_mismatch'
	| 'refill_mismatch'
	| 'quantity_out_of_range'
	| 'pilot_limit_exceeded'
	| 'insufficient_balance'
	| 'below_reliability_floor'
	| 'cost_cap_exceeded'
	| 'margin_floor_breached'
	| 'not_selected_by_policy';

export interface BoostCustomerOfferEnvelope {
	id: string;
	platform: BoostCatalogPlatform;
	outcome: BoostCatalogOutcome;
	targetType: Exclude<BoostTargetType, 'unknown'>;
	quantity: number;
	customerPriceNgn: number;
	minimumMarginPercent: number;
	maximumSupplierCostNgn: number;
	requiredVerifiedSignals: string[];
	audienceTag: string | null;
	refillDays: number | null;
	routingPolicy: BoostRoutingPolicy;
	preferredRouteId: string | null;
	lockedRouteId: string | null;
}

export interface BoostProviderRuntimeState {
	provider: BoostProviderId;
	enabled: boolean;
	circuitOpen: boolean;
	catalogFresh: boolean;
	balanceFresh: boolean;
	projectedBalanceUsd: number;
	balanceSafetyUsd: number;
}

export interface BoostApprovedRoute {
	id: string;
	service: BoostProviderService;
	state: BoostRouteState;
	equivalenceApproved: boolean;
	verifiedSignals: string[];
	audienceTags: string[];
	verifiedRefillDays: number | null;
	reliabilityScore: number;
	reliabilityObservations: number;
	minimumReliabilityObservations: number;
	maximumPilotQuantity: number | null;
	expectedRecoveryCostPercent: number;
}

export interface BoostRouteProjection {
	routeId: string;
	provider: BoostProviderId;
	providerServiceId: string;
	rawSupplierCostUsd: number;
	projectedSupplierCostNgn: number;
	projectedMarginNgn: number;
	projectedMarginPercent: number;
	reliabilityScore: number;
	reasons: BoostRouteExclusionReason[];
	eligible: boolean;
	selected: boolean;
}

export interface BoostRouteSimulation {
	selectedRouteId: string | null;
	selectionReason: 'lowest_safe_cost' | 'preferred_route' | 'locked_route' | 'no_safe_route';
	projections: BoostRouteProjection[];
}

export interface SimulateBoostRouteInput {
	offer: BoostCustomerOfferEnvelope;
	routes: BoostApprovedRoute[];
	providers: BoostProviderRuntimeState[];
	usdToNgn: number;
	currencyBufferPercent: number;
	reliabilityFloor: number;
	/** Shadow evaluation may compare approved shadow routes; live routing never may. */
	executionMode?: 'live' | 'shadow';
}

function validPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, value);
}

function uniqueReasons(reasons: BoostRouteExclusionReason[]): BoostRouteExclusionReason[] {
	return [...new Set(reasons)];
}

function projectRoute(
	input: SimulateBoostRouteInput,
	route: BoostApprovedRoute
): BoostRouteProjection {
	const { offer } = input;
	const service = route.service;
	const provider = input.providers.find((candidate) => candidate.provider === service.provider);
	const reasons: BoostRouteExclusionReason[] = [];

	if (!route.equivalenceApproved) reasons.push('not_approved');
	const routeStateAllowed =
		route.state === 'enabled' || (input.executionMode === 'shadow' && route.state === 'shadow');
	if (!routeStateAllowed) reasons.push('route_not_enabled');
	if (!provider?.enabled || provider?.circuitOpen) reasons.push('provider_unavailable');
	if (!provider?.catalogFresh) reasons.push('catalog_stale');
	if (!provider?.balanceFresh) reasons.push('balance_stale');
	if (service.status === 'quarantined') reasons.push('service_quarantined');
	if (!service.platforms.includes(offer.platform) || !service.outcomes.includes(offer.outcome)) {
		reasons.push('offer_mismatch');
	}
	if (service.targetType !== offer.targetType) reasons.push('target_mismatch');
	if (offer.requiredVerifiedSignals.some((signal) => !route.verifiedSignals.includes(signal))) {
		reasons.push('missing_verified_promise');
	}
	if (offer.audienceTag && !route.audienceTags.includes(offer.audienceTag)) {
		reasons.push('audience_mismatch');
	}
	if (
		offer.refillDays !== null &&
		(service.refillAdvertised !== true ||
			route.verifiedRefillDays === null ||
			route.verifiedRefillDays < offer.refillDays)
	) {
		reasons.push('refill_mismatch');
	}
	if (
		service.minQuantity === null ||
		service.maxQuantity === null ||
		offer.quantity < service.minQuantity ||
		offer.quantity > service.maxQuantity
	) {
		reasons.push('quantity_out_of_range');
	}
	if (route.maximumPilotQuantity !== null && offer.quantity > route.maximumPilotQuantity) {
		reasons.push('pilot_limit_exceeded');
	}
	if (
		route.reliabilityObservations >= route.minimumReliabilityObservations &&
		route.reliabilityScore < input.reliabilityFloor
	) {
		reasons.push('below_reliability_floor');
	}

	const rawSupplierCostUsd =
		service.ratePerThousand === null || offer.quantity <= 0
			? Number.POSITIVE_INFINITY
			: (service.ratePerThousand * offer.quantity) / 1000;
	const costMultiplier =
		1 +
		validPercent(input.currencyBufferPercent) / 100 +
		validPercent(route.expectedRecoveryCostPercent) / 100;
	const projectedSupplierCostNgn = rawSupplierCostUsd * input.usdToNgn * costMultiplier;
	const projectedMarginNgn = offer.customerPriceNgn - projectedSupplierCostNgn;
	const projectedMarginPercent =
		offer.customerPriceNgn > 0 ? (projectedMarginNgn / offer.customerPriceNgn) * 100 : -Infinity;

	if (
		!provider ||
		!Number.isFinite(rawSupplierCostUsd) ||
		provider.projectedBalanceUsd - provider.balanceSafetyUsd < rawSupplierCostUsd
	) {
		reasons.push('insufficient_balance');
	}
	if (
		!Number.isFinite(projectedSupplierCostNgn) ||
		projectedSupplierCostNgn > offer.maximumSupplierCostNgn
	) {
		reasons.push('cost_cap_exceeded');
	}
	if (projectedMarginPercent < offer.minimumMarginPercent) reasons.push('margin_floor_breached');

	const finalReasons = uniqueReasons(reasons);
	return {
		routeId: route.id,
		provider: service.provider,
		providerServiceId: service.serviceId,
		rawSupplierCostUsd,
		projectedSupplierCostNgn,
		projectedMarginNgn,
		projectedMarginPercent,
		reliabilityScore: route.reliabilityScore,
		reasons: finalReasons,
		eligible: finalReasons.length === 0,
		selected: false
	};
}

export function simulateBoostRoute(input: SimulateBoostRouteInput): BoostRouteSimulation {
	if (!Number.isFinite(input.usdToNgn) || input.usdToNgn <= 0) {
		throw new RangeError('A positive USD to NGN conversion rate is required.');
	}
	if (!Number.isFinite(input.offer.quantity) || input.offer.quantity <= 0) {
		throw new RangeError('A positive quantity is required.');
	}

	const projections = input.routes.map((route) => projectRoute(input, route));
	const eligible = projections
		.filter((projection) => projection.eligible)
		.sort(
			(left, right) =>
				left.projectedSupplierCostNgn - right.projectedSupplierCostNgn ||
				right.reliabilityScore - left.reliabilityScore
		);

	let selected: BoostRouteProjection | undefined;
	let selectionReason: BoostRouteSimulation['selectionReason'] = 'no_safe_route';
	if (input.offer.routingPolicy === 'locked') {
		selected = eligible.find((projection) => projection.routeId === input.offer.lockedRouteId);
		if (selected) selectionReason = 'locked_route';
	} else if (input.offer.routingPolicy === 'preferred') {
		selected = eligible.find((projection) => projection.routeId === input.offer.preferredRouteId);
		if (selected) selectionReason = 'preferred_route';
		else if (eligible[0]) {
			selected = eligible[0];
			selectionReason = 'lowest_safe_cost';
		}
	} else if (eligible[0]) {
		selected = eligible[0];
		selectionReason = 'lowest_safe_cost';
	}

	if (input.offer.routingPolicy === 'locked' && input.offer.lockedRouteId) {
		for (const projection of projections) {
			if (projection.routeId !== input.offer.lockedRouteId && projection.eligible) {
				projection.reasons = ['not_selected_by_policy'];
				projection.eligible = false;
			}
		}
	}
	if (selected) selected.selected = true;

	return {
		selectedRouteId: selected?.routeId ?? null,
		selectionReason,
		projections
	};
}
