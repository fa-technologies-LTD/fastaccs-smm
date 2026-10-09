import { roundUpCatalogPriceNgn as roundCatalogPriceNgn } from './catalog-pricing';
import { normalizeBoostingQuantity } from './boosting-service-config';

export const BOOSTING_MINIMUM_CHECKOUT_NGN = 500;

export function boostingMinimumMessage(total: number): string | null {
	if (!Number.isFinite(total)) return 'Please refresh your cart.';
	const missing = Math.max(0, Math.round((BOOSTING_MINIMUM_CHECKOUT_NGN - total) * 100) / 100);
	return missing > 0
		? `Add ₦${missing.toLocaleString('en-NG', { maximumFractionDigits: 2 })} more in Boosting to check out.`
		: null;
}

/** Suggest a starting quantity without changing supplier limits or the quantity grid. */
export function boostingStartingQuantity(offer: {
	minQuantity: number;
	maxQuantity: number | null;
	stepQuantity: number;
	pricePerStepNgn: number;
}): number {
	const { minQuantity, stepQuantity, pricePerStepNgn, maxQuantity } = offer;
	if (!(pricePerStepNgn > 0) || !(stepQuantity > 0)) return minQuantity;
	// With upward ₦50 rounding, totals strictly above ₦450 display as ₦500.
	const startingPrice = (minQuantity / stepQuantity) * pricePerStepNgn;
	const steps = Math.max(
		0,
		Math.floor((BOOSTING_MINIMUM_CHECKOUT_NGN - 50 - startingPrice) / pricePerStepNgn) + 1
	);
	const candidate = normalizeBoostingQuantity(
		minQuantity + steps * stepQuantity,
		minQuantity,
		stepQuantity,
		maxQuantity
	);
	return roundCatalogPriceNgn((candidate / stepQuantity) * pricePerStepNgn) >= 500
		? candidate
		: normalizeBoostingQuantity(candidate + stepQuantity, minQuantity, stepQuantity, maxQuantity);
}
