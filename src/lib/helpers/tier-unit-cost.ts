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
 * existing cost; an empty box clears it; anything else must be a non-negative number. Admins who
 * cannot see costs (they get public tier data) can never set or clear it: their save keeps it.
 */
export function applyTierUnitCostSanitization(
	metadata: Record<string, unknown>,
	existingMetadata: unknown = {},
	options: { canEditCost?: boolean } = {}
): Record<string, unknown> {
	const next = { ...metadata };
	if (options.canEditCost === false) delete next[TIER_UNIT_COST_KEY];
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

export interface TierMarginNote {
	level: 'error' | 'warning' | 'info';
	text: string;
}

const THIN_MARGIN = 0.4;
const VERY_THIN_MARGIN = 0.2;

/**
 * Live advice under the cost box while a full admin edits a tier. Never blocks a save: the owner
 * checks the real numbers outside the app.
 */
export function tierMarginNotes(input: {
	priceNgn: unknown;
	unitCostNgn: unknown;
	affiliateExcluded?: boolean;
}): { marginPercent: number | null; profitNgn: number | null; notes: TierMarginNote[] } {
	const price = Number(input.priceNgn);
	const cost = parseTierUnitCost({ [TIER_UNIT_COST_KEY]: input.unitCostNgn });
	if (cost === null) {
		return {
			marginPercent: null,
			profitNgn: null,
			notes: [
				{
					level: 'info',
					text: 'No cost yet: Super order earnings on this tier are held until you add one.'
				}
			]
		};
	}
	if (!Number.isFinite(price) || price <= 0) {
		return { marginPercent: null, profitNgn: null, notes: [] };
	}
	const profit = Math.round((price - cost) * 100) / 100;
	const margin = profit / price;
	const percent = Math.round(margin * 1000) / 10;
	const naira = (value: number) => `₦${Math.abs(value).toLocaleString('en-NG')}`;
	const notes: TierMarginNote[] = [
		{ level: 'info', text: `Margin ${percent}% · ${naira(profit)} per account.` }
	];
	if (profit <= 0) {
		notes.push({
			level: 'error',
			text:
				profit === 0
					? 'Cost equals the price: each sale makes nothing.'
					: `Cost is above the price: each sale loses ${naira(profit)}.`
		});
	} else if (margin < VERY_THIN_MARGIN) {
		notes.push({
			level: 'warning',
			text: input.affiliateExcluded
				? `Very thin margin (${percent}%): any discount or store credit can wipe out the profit.`
				: `Very thin margin (${percent}%): the affiliate offer (5% off + 5% commission) takes half or more of the profit.`
		});
	} else if (margin < THIN_MARGIN) {
		notes.push({
			level: 'warning',
			text: `Thin margin (${percent}%): a ₦1,000 Refer & Win reward is more than half the profit on ₦5,000 of this tier.`
		});
	}
	return { marginPercent: percent, profitNgn: profit, notes };
}
