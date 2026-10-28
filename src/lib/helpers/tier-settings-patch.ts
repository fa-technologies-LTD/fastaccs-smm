import { applyTierDeliveryConfigSanitization } from '$lib/helpers/tier-delivery-config';
import { applyTierCatalogPriceSanitization } from '$lib/helpers/catalog-pricing';
import { applyTierUnitCostSanitization, TIER_UNIT_COST_KEY } from '$lib/helpers/tier-unit-cost';

/**
 * One account-type setting changed from the page that owns it, without resending the whole form:
 * the WhatsApp availability switch from Inventory, price and cost from Pricing. Everything else in
 * the saved settings stays exactly as it was.
 */
export interface TierSettingsPatch {
	manualAvailable?: boolean;
	basePrice?: number;
	/** null or '' clears the cost. */
	unitCostNgn?: number | string | null;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? { ...(value as Record<string, unknown>) }
		: {};
}

export function parseTierSettingsPatch(
	body: unknown
): { patch: TierSettingsPatch } | { error: string } {
	const input = record(body);
	const patch: TierSettingsPatch = {};
	if ('manualAvailable' in input) {
		if (typeof input.manualAvailable !== 'boolean')
			return { error: 'manualAvailable must be true or false.' };
		patch.manualAvailable = input.manualAvailable;
	}
	if ('basePrice' in input) {
		const price = Number(input.basePrice);
		if (!Number.isFinite(price) || price <= 0) return { error: 'Enter a price above ₦0.' };
		patch.basePrice = price;
	}
	if ('unitCostNgn' in input) {
		const raw = input.unitCostNgn;
		if (raw === null || raw === '') patch.unitCostNgn = null;
		else {
			const cost = Number(raw);
			if (!Number.isFinite(cost) || cost < 0) return { error: 'Enter a cost of ₦0 or more.' };
			patch.unitCostNgn = cost;
		}
	}
	if (!Object.keys(patch).length) return { error: 'Nothing to change.' };
	return { patch };
}

export function applyTierSettingsPatch(
	existingMetadata: unknown,
	patch: TierSettingsPatch,
	options: { canEditCost: boolean }
): Record<string, unknown> {
	const next = record(existingMetadata);
	if (patch.manualAvailable !== undefined) next.manual_available = patch.manualAvailable;
	if (patch.basePrice !== undefined) {
		next.pricing = { ...record(next.pricing), base_price: patch.basePrice };
		if (next.price !== undefined) next.price = patch.basePrice;
	}
	if (patch.unitCostNgn !== undefined && options.canEditCost) {
		if (patch.unitCostNgn === null) next[TIER_UNIT_COST_KEY] = '';
		else next[TIER_UNIT_COST_KEY] = patch.unitCostNgn;
	}
	return applyTierUnitCostSanitization(
		applyTierCatalogPriceSanitization(applyTierDeliveryConfigSanitization(next)),
		existingMetadata,
		{ canEditCost: options.canEditCost }
	);
}
