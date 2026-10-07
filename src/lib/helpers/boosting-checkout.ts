import { roundCatalogPriceNgn } from './catalog-pricing';
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
	// Catalogue totals round to ₦50: ₦475 is the first raw total displayed as ₦500.
	const rawMinimum = ((BOOSTING_MINIMUM_CHECKOUT_NGN - 25) * stepQuantity) / pricePerStepNgn;
	const steps = Math.max(0, Math.ceil((rawMinimum - minQuantity) / stepQuantity));
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
