import type {
	BoostPricingRow,
	BoostPricingSheet,
	BoostPricingQuote,
	BoostPricingView
} from './boosting-pricing-sheet';
import { pricingEconomics, pricingStepPrice, pricingWarnings } from './boosting-pricing-sheet';
import { roundUpCatalogPriceNgn } from './catalog-pricing';

export interface BoostingSetupData {
	offers: Array<{
		id: string;
		name: string;
		isActive: boolean;
		platform: string;
		platformLabel: string;
		outcome: string;
		outcomeLabel: string;
		pricePerStepNgn: number;
		reviewedTierCount?: number;
	}>;
	firstReviewQueue?: Array<{ categoryId: string; qualityTier: string }>;
	mappingSummary: {
		categories: number;
		tiers: number;
		reviewedTiers: number;
		approvedRoutes: number;
	};
}
export interface BoostControlsView extends BoostPricingView {
	setup: Record<
		string,
		{ categoryId: string; routingPolicy: string; maximumCostNgn: number; reviewed: boolean }
	>;
	archivedDraft: boolean;
	catalogMaxAgeMinutes?: number;
}

export function validateBoostRules(settings: BoostPricingSheet['settings']) {
	for (const [name, value, max] of [
		['Default profit percentage', settings.defaultMarkup ?? 40, 500],
		['Profit target', settings.profitTargetNgn ?? 0, 10000000],
		['Minimum retained profit', settings.hardProfitNgn ?? 0, 10000000],
		['Price multiple', settings.maxPriceMultiple ?? 0, 100000]
	] as const) {
		if (!Number.isFinite(value) || value < 0 || value > max)
			throw new Error(`Check ${name.toLowerCase()}.`);
	}
	if ((settings.maxPriceMultiple ?? 0) > 0 && settings.maxPriceMultiple! < 1)
		throw new Error('Price multiple must be zero (off) or at least one.');
}

export function boostAutoPrice(
	row: BoostPricingRow,
	sheet: BoostPricingSheet,
	quote: BoostPricingQuote | null
): number | null {
	const { cost } = pricingEconomics(row, sheet, quote);
	if (cost === null) return null;
	const markup = row.useDefaultMarkup ? (sheet.settings.defaultMarkup ?? 40) : row.targetMarkup;
	const target = Math.max(
		row.profitTargetNgn ?? sheet.settings.profitTargetNgn ?? 0,
		Math.max(sheet.settings.hardProfitNgn ?? 0, row.hardProfitNgn ?? 0)
	);
	const feePercent = sheet.settings.feeConfirmed ? sheet.settings.feePercent / 100 : 0;
	const fixed = sheet.settings.feeConfirmed ? sheet.settings.feeFixed : 0;
	const floor = (cost + target + fixed) / (1 - feePercent);
	const desired = (cost * (1 + markup / 100) + fixed) / (1 - feePercent);
	const multiple = sheet.settings.maxPriceMultiple ?? 0;
	const cap = multiple > 0 ? (cost * multiple + fixed) / (1 - feePercent) : Infinity;
	return roundUpCatalogPriceNgn(Math.max(floor, Math.min(desired, cap)));
}

export function boostRowWarnings(
	row: BoostPricingRow,
	sheet: BoostPricingSheet,
	quote: BoostPricingQuote | null
): string[] {
	const issues = [...(quote?.issues ?? ['Choose a supplier.'])];
	const economics = pricingEconomics(row, sheet, quote);
	if (!row.sourceOfferId) issues.push('Set up this offer.');
	if (quote?.min != null && row.startingQuantity < quote.min)
		issues.push('Below supplier minimum.');
	if (quote?.max != null && row.startingQuantity > quote.max)
		issues.push('Above supplier maximum.');
	if (economics.profit !== null && economics.profit <= 0) issues.push('No profit at this price.');
	const targetMarkup = row.useDefaultMarkup
		? (sheet.settings.defaultMarkup ?? 40)
		: row.targetMarkup;
	if (economics.markup !== null && economics.markup + 0.01 < targetMarkup)
		issues.push('Below profit target.');
	if (
		economics.profit !== null &&
		economics.profit < Math.max(sheet.settings.hardProfitNgn ?? 0, row.hardProfitNgn ?? 0)
	)
		issues.push('Below minimum retained profit.');
	if (
		economics.profit !== null &&
		economics.profit < (row.profitTargetNgn ?? sheet.settings.profitTargetNgn ?? 0)
	)
		issues.push('Below profit target.');
	try {
		pricingStepPrice(row);
	} catch {
		issues.push('Price does not fit the quantity increment.');
	}
	issues.push(
		...pricingWarnings(row, sheet, quote).filter((w) =>
			['Check option price order.', 'Costs more per item than followers.'].includes(w)
		)
	);
	return [...new Set(issues)];
}

/** Compare commercial controls only; supplier setup is edited separately and never silently replaced. */
export function boostControlSignature(row: BoostPricingRow): string {
	return JSON.stringify([
		row.selected,
		row.sale,
		row.priceMode,
		row.targetMarkup,
		row.useDefaultMarkup ?? false,
		row.profitTargetNgn ?? null,
		row.hardProfitNgn ?? null
	]);
}
