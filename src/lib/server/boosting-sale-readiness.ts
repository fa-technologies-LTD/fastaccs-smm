import type { Prisma } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { boostingStartingQuantity } from '$lib/helpers/boosting-checkout';
import { roundUpCatalogPriceNgn } from '$lib/helpers/catalog-pricing';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import { serviceMatchesBoostOutcome } from './boosting-providers/catalog-normalizer';

export const boostSaleInclude = {
	routes: { include: { providerService: { include: { providerState: true } } } }
} satisfies Prisma.BoostCustomerOfferInclude;
export type BoostSaleOffer = Prisma.BoostCustomerOfferGetPayload<{
	include: typeof boostSaleInclude;
}>;

const positive = (value: unknown, fallback: number, minimum = 0) => {
	const number = Number(value);
	return Number.isFinite(number) && number >= minimum ? number : fallback;
};
const number = (value: unknown) => (value == null ? NaN : Number(value));

/** Read-only refusal checks. Never selects/ranks a supplier, contacts one, or submits an order. */
export function inspectBoostSale(
	offer: BoostSaleOffer,
	fx: number,
	quantity = boostingStartingQuantity({ ...offer, pricePerStepNgn: number(offer.pricePerStepNgn) }),
	options: { now?: Date; customerPriceNgn?: number; requirePublished?: boolean } = {}
) {
	const now = (options.now ?? new Date()).getTime();
	// Match dispatch defaults: stale data must be refused before payment, not only afterward.
	const catalogAge = positive(env.BOOSTING_CATALOG_MAX_AGE_MINUTES, 90, 5) * 60_000;
	const balanceAge = positive(env.BOOSTING_BALANCE_MAX_AGE_MINUTES, 45, 5) * 60_000;
	const fresh = (date: Date | null | undefined, age: number) => {
		const time = date?.getTime();
		return time != null && Number.isFinite(time) && time <= now && now - time <= age;
	};
	const price =
		options.customerPriceNgn ??
		roundUpCatalogPriceNgn((quantity / offer.stepQuantity) * number(offer.pricePerStepNgn));
	const offerReasons: string[] = [];
	if (options.requirePublished !== false && offer.status !== 'live')
		offerReasons.push('This offer is not published.');
	if (
		!Number.isSafeInteger(quantity) ||
		quantity > 2147483647 ||
		quantity < offer.minQuantity ||
		!Number.isSafeInteger(offer.stepQuantity) ||
		offer.stepQuantity < 1 ||
		(quantity - offer.minQuantity) % offer.stepQuantity !== 0 ||
		(offer.maxQuantity != null && quantity > offer.maxQuantity)
	)
		offerReasons.push('The quantity is outside this offer’s limits.');
	if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(fx) || fx <= 0)
		offerReasons.push('Price information is missing or invalid.');
	const mapped = offer.routes.filter(
		(route) => offer.routingPolicy !== 'locked' || route.id === offer.lockedRouteId
	);
	if (!mapped.length) offerReasons.push('No supplier is mapped to this offer.');
	const checks = mapped.map((route) => {
		const reasons: string[] = [];
		const service = route.providerService;
		const state = service.providerState;
		if (!['smm_raja', 'bulk_follows'].includes(service.provider))
			reasons.push('The supplier is not supported.');
		if (!route.equivalenceApproved || route.state !== 'enabled')
			reasons.push('The supplier mapping is not approved and enabled.');
		if (!state?.enabled || state.circuitOpen || state.currency?.toUpperCase() !== 'USD')
			reasons.push('The supplier is paused or its account currency is unsupported.');
		if (
			service.unavailableAt ||
			!['ready_for_review', 'needs_classification'].includes(service.catalogueStatus)
		)
			reasons.push('The supplier service is unavailable.');
		if (!fresh(state?.lastCatalogueSuccessAt, catalogAge) || !fresh(service.lastSeenAt, catalogAge))
			reasons.push('Supplier catalogue information needs refreshing.');
		if (!fresh(state?.lastBalanceSuccessAt, balanceAge))
			reasons.push('Supplier balance information needs refreshing.');
		if (
			!service.platforms.includes(offer.platform) ||
			!service.outcomes.includes(offer.outcome) ||
			!serviceMatchesBoostOutcome(service, offer.outcome) ||
			!supportsBoostServiceInput(service.providerType, offer.outcome) ||
			service.targetType !== offer.targetType ||
			route.targetType !== offer.targetType
		)
			reasons.push('The supplier service does not match the customer option or required input.');
		const min = Math.max(service.minQuantity ?? Infinity, route.minimumQuantity);
		const max = Math.min(service.maxQuantity ?? 0, route.maximumQuantity);
		if (
			quantity < min ||
			quantity > max ||
			(route.quantityStep != null && (quantity - route.minimumQuantity) % route.quantityStep !== 0)
		)
			reasons.push('The quantity is outside the supplier’s limits.');
		if (offer.requiredVerifiedSignals.some((signal) => !route.verifiedSignals.includes(signal)))
			reasons.push('A customer-facing service claim has not been verified.');
		if (offer.audienceTag !== 'general' && !route.audienceTags.includes(offer.audienceTag))
			reasons.push('The advertised audience does not match the supplier.');
		if (
			offer.refillDays != null &&
			(service.refillAdvertised !== true ||
				route.verifiedRefillDays == null ||
				route.verifiedRefillDays < offer.refillDays)
		)
			reasons.push('The advertised refill cover is not verified for this supplier.');
		if (
			route.reliabilityObservations >= 3 &&
			number(route.reliabilityScore) < positive(env.BOOSTING_RELIABILITY_FLOOR, 0.8)
		)
			reasons.push('Recorded delivery reliability is below the existing safety requirement.');
		const costUsd = (number(service.ratePerThousand) * quantity) / 1000;
		const cost = costUsd * fx;
		// Dispatch reserves against projectedBalance specifically; a historic raw balance
		// cannot substitute for a missing spendable balance.
		const balance = number(state?.projectedBalance);
		if (
			!Number.isFinite(costUsd) ||
			costUsd < 0 ||
			!Number.isFinite(balance) ||
			balance - positive(env.BOOSTING_BALANCE_SAFETY_USD, 5) < costUsd
		)
			reasons.push('The recorded supplier balance is insufficient after its safety reserve.');
		const cap = (number(offer.maximumSupplierCostNgn) * quantity) / offer.minQuantity;
		if (
			!Number.isFinite(cost) ||
			!Number.isFinite(cap) ||
			Math.ceil((cost - 1e-9) * 100) > Math.floor((cap + 1e-9) * 100)
		)
			reasons.push('Supplier cost exceeds the approved spending limit.');
		if (cost <= 0 || ((price - cost) / cost) * 100 < number(offer.minimumMarginPercent))
			reasons.push('The price does not meet the existing profit safety requirement.');
		return { reasons, maximum: max };
	});
	const passing = checks.filter((check) => !check.reasons.length);
	return {
		available: !offerReasons.length && passing.length > 0,
		reasons: [
			...new Set([
				...offerReasons,
				...(passing.length ? [] : checks.flatMap((check) => check.reasons))
			])
		],
		maximumQuantity: passing.length
			? Math.min(
					2147483647,
					offer.maxQuantity ?? Infinity,
					Math.max(...passing.map((check) => check.maximum))
				)
			: offer.maxQuantity,
		checkedAt: new Date(now).toISOString()
	};
}
