export const CATALOG_PRICE_INCREMENT_NGN = 50;

/**
 * Keep manually managed customer-facing catalogue prices on a clean ₦50 grid.
 * Zero remains zero for unavailable/coming-soon products. Discounts, historical
 * orders, refunds and supplier costs deliberately do not use this function.
 */
export function roundCatalogPriceNgn(value: unknown): number {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount <= 0) return 0;
	return Math.max(
		CATALOG_PRICE_INCREMENT_NGN,
		Math.round(amount / CATALOG_PRICE_INCREMENT_NGN) * CATALOG_PRICE_INCREMENT_NGN
	);
}

/** Normalize an account tier's current or legacy base-price field at the API boundary. */
export function applyTierCatalogPriceSanitization(metadata: unknown): Record<string, unknown> {
	const safeMetadata: Record<string, unknown> =
		metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? { ...(metadata as Record<string, unknown>) }
			: {};

	if (
		safeMetadata.pricing &&
		typeof safeMetadata.pricing === 'object' &&
		!Array.isArray(safeMetadata.pricing)
	) {
		const pricing = { ...(safeMetadata.pricing as Record<string, unknown>) };
		if (pricing.base_price !== undefined) {
			pricing.base_price = roundCatalogPriceNgn(pricing.base_price);
		}
		safeMetadata.pricing = pricing;
	}

	if (safeMetadata.price !== undefined) {
		safeMetadata.price = roundCatalogPriceNgn(safeMetadata.price);
	}

	return safeMetadata;
}
