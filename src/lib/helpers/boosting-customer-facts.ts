import { BOOSTING_ACTION_LABELS } from './boosting-service-config';
import type { BoostingActionType } from './social-link-validator';
import { boostingStartingQuantity } from './boosting-checkout';
import { roundUpCatalogPriceNgn } from './catalog-pricing';

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

/** Facts from reviewed offer data or the immutable purchased snapshot, never supplier advertising. */
export function boostBenefitLabel(value: unknown): string | null {
	const offer = record(value);
	if (Number.isSafeInteger(offer.refillDays) && Number(offer.refillDays) > 0)
		return `${offer.refillDays}-day refill`;
	const audience = typeof offer.audienceTag === 'string' ? offer.audienceTag : '';
	const countries: Record<string, string> = {
		ng: 'Nigeria',
		nigeria: 'Nigeria',
		us: 'US',
		usa: 'US',
		uk: 'UK',
		gb: 'UK',
		united_kingdom: 'UK',
		in: 'India',
		india: 'India',
		br: 'Brazil',
		brazil: 'Brazil'
	};
	const label = countries[audience.toLowerCase()];
	const routes = Array.isArray(offer.routes)
		? offer.routes
				.map(record)
				.filter(
					(route) =>
						route.state === 'enabled' &&
						route.equivalenceApproved === true &&
						(offer.routingPolicy !== 'locked' || route.id === offer.lockedRouteId)
				)
		: [];
	return label &&
		routes.length &&
		routes.every(
			(route) => Array.isArray(route.audienceTags) && route.audienceTags.includes(audience)
		)
		? `${label} audience`
		: null;
}

export function boostQuantityText(quantity: number, outcome: string): string {
	let unit =
		outcome === 'custom_comments'
			? 'comments'
			: outcome === 'watch_time'
				? 'watch-time units'
				: (BOOSTING_ACTION_LABELS[outcome as BoostingActionType] ?? 'units').toLowerCase();
	if (quantity === 1 && unit.endsWith('s')) unit = unit.slice(0, -1);
	return `${quantity.toLocaleString('en-NG')} ${unit}`;
}

interface PricedOffer {
	id: string;
	platform: string;
	outcome: string;
	benefitLabel?: string | null;
	minQuantity: number;
	maxQuantity: number | null;
	stepQuantity: number;
	pricePerStepNgn: number;
}

/** A conservative same-quantity, actually purchasable comparison. No quality ranking or price mutation. */
export function boostLowerPriceOffer(offers: PricedOffer[]): string | null {
	if (
		offers.length < 2 ||
		offers.some(
			(offer) =>
				offer.platform !== offers[0].platform ||
				offer.outcome !== offers[0].outcome ||
				!Number.isSafeInteger(offer.minQuantity) ||
				offer.minQuantity < 1 ||
				!Number.isSafeInteger(offer.stepQuantity) ||
				offer.stepQuantity < 1 ||
				!Number.isFinite(offer.pricePerStepNgn) ||
				offer.pricePerStepNgn <= 0 ||
				Boolean(offer.benefitLabel?.endsWith(' audience'))
		)
	)
		return null;
	const anchor = offers.reduce((a, b) => (a.stepQuantity > b.stepQuantity ? a : b));
	const minimum = Math.max(1000, ...offers.map(boostingStartingQuantity));
	const maximum = Math.min(2147483647, ...offers.map((offer) => offer.maxQuantity ?? 2147483647));
	let quantity =
		anchor.minQuantity +
		Math.max(0, Math.ceil((minimum - anchor.minQuantity) / anchor.stepQuantity)) *
			anchor.stepQuantity;
	// Bounded work; if grids have no common tested quantity, omit the claim.
	for (
		let attempt = 0;
		attempt < 128 && quantity <= maximum;
		attempt++, quantity += anchor.stepQuantity
	) {
		if (offers.some((offer) => (quantity - offer.minQuantity) % offer.stepQuantity !== 0)) continue;
		const prices = offers
			.map((offer) => ({
				id: offer.id,
				price: roundUpCatalogPriceNgn((quantity / offer.stepQuantity) * offer.pricePerStepNgn)
			}))
			.sort((a, b) => a.price - b.price);
		return prices[0].price < prices[1].price ? prices[0].id : null;
	}
	return null;
}
