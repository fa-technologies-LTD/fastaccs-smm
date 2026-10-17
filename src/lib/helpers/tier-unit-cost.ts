/** Private tier setting: our real goods cost per unit (₦), entered on each tier. */
export const TIER_UNIT_COST_KEY = 'unit_cost_ngn';

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Blank (or anything that is not a non-negative number) means "no cost entered". */
export function parseTierUnitCost(metadata: unknown): number | null {
	const raw = record(metadata)[TIER_UNIT_COST_KEY];
	if (raw === null || raw === undefined || raw === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

/** Value for the admin form input: the saved cost, or an empty box. */
export function parseTierUnitCostForForm(metadata: unknown): number | string {
	return parseTierUnitCost(metadata) ?? '';
}

/**
 * Normalise the cost on save. A payload that does not mention the cost (an older form) keeps the
 * existing cost; an empty box clears it; anything else must be a non-negative number.
 */
export function applyTierUnitCostSanitization(
	metadata: Record<string, unknown>,
	existingMetadata: unknown = {}
): Record<string, unknown> {
	const next = { ...metadata };
	if (!(TIER_UNIT_COST_KEY in next)) {
		const existing = parseTierUnitCost(existingMetadata);
		if (existing !== null) next[TIER_UNIT_COST_KEY] = existing;
		return next;
	}
	const parsed = parseTierUnitCost(next);
	if (parsed === null) delete next[TIER_UNIT_COST_KEY];
	else next[TIER_UNIT_COST_KEY] = parsed;
	return next;
}
