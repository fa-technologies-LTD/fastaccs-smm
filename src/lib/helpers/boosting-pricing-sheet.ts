import { roundUpCatalogPriceNgn } from './catalog-pricing';
import { boostingStartingQuantity } from './boosting-checkout';

export interface BoostPricingRow {
	id: string;
	sourceOfferId: string | null;
	sourceUpdatedAt: string | null;
	platform: string;
	outcome: string;
	tier: string;
	title: string;
	option: string;
	selected: boolean;
	provider: 'bulk_follows' | 'smm_raja';
	serviceId: string;
	units: number;
	sale: number;
	targetMarkup: number;
	priceMode: 'manual' | 'target';
	increment: number;
	startingQuantity: number;
	recoveryMode: 'off' | 'definitive' | 'fallback';
	profitBudgetPercent: number;
	attempts: number;
	note: string;
}
export interface BoostPricingSheet {
	version: number;
	settings: { fx: number; feePercent: number; feeFixed: number; feeConfirmed: boolean };
	rows: BoostPricingRow[];
}
export interface BoostPricingQuote {
	providerServiceId: string;
	name: string;
	rateUsd: number | null;
	min: number | null;
	max: number | null;
	checkedAt: string;
	issues: string[];
}
export interface BoostPricingView {
	sheet: BoostPricingSheet;
	quotes: Record<string, BoostPricingQuote | null>;
	liveStatuses: Record<string, string>;
	changedRows?: string[];
	history: Array<{ id: string; action: string; createdAt: string; version: number }>;
	approval: { id: string; approvedAt: string; digest: string };
}

export function pricingEconomics(
	row: BoostPricingRow,
	sheet: BoostPricingSheet,
	quote: BoostPricingQuote | null
) {
	const cost =
		quote?.rateUsd == null ? null : (quote.rateUsd * sheet.settings.fx * row.units) / 1000;
	const fees = sheet.settings.feeConfirmed
		? (row.sale * sheet.settings.feePercent) / 100 + sheet.settings.feeFixed
		: 0;
	const profit = cost === null ? null : row.sale - cost - fees;
	const markup = cost && profit !== null ? (profit / cost) * 100 : null;
	const recoveryBudget =
		profit === null ? null : (Math.max(0, profit) * row.profitBudgetPercent) / 100;
	return { cost, fees, profit, markup, recoveryBudget };
}

export function pricingTarget(
	row: BoostPricingRow,
	sheet: BoostPricingSheet,
	quote: BoostPricingQuote | null
): number | null {
	const { cost } = pricingEconomics(row, sheet, quote);
	if (cost === null) return null;
	const fees = sheet.settings.feeConfirmed ? sheet.settings.feePercent : 0;
	const fixed = sheet.settings.feeConfirmed ? sheet.settings.feeFixed : 0;
	return roundUpCatalogPriceNgn((cost * (1 + row.targetMarkup / 100) + fixed) / (1 - fees / 100));
}

/** The pack is a pricing unit, not the customer's increment. Reject unrepresentable kobo values. */
export function pricingStepPrice(row: BoostPricingRow): number {
	const raw = (row.sale * row.increment) / row.units;
	const kobo = Math.round(raw * 100);
	if (!Number.isSafeInteger(kobo) || kobo < 1 || Math.abs(kobo - raw * 100) > 1e-6) {
		throw new Error(
			`${row.title}: this pack price cannot be represented exactly at that increment.`
		);
	}
	return kobo / 100;
}

export function pricingStart(row: BoostPricingRow, max: number | null): number {
	try {
		return boostingStartingQuantity({
			minQuantity: row.startingQuantity,
			stepQuantity: row.increment,
			pricePerStepNgn: pricingStepPrice(row),
			maxQuantity: max
		});
	} catch {
		return row.startingQuantity;
	}
}

export function pricingWarnings(
	row: BoostPricingRow,
	sheet: BoostPricingSheet,
	quote: BoostPricingQuote | null
): string[] {
	const warnings = [...(quote?.issues ?? ['Look up this supplier code.'])];
	const e = pricingEconomics(row, sheet, quote);
	if (!row.sourceOfferId) warnings.push('Set up this result before publishing.');
	if (quote?.min != null && row.startingQuantity < quote.min)
		warnings.push(`Supplier minimum is ${quote.min.toLocaleString()}.`);
	if (quote?.max != null && pricingStart(row, quote.max) > quote.max)
		warnings.push('Starting quantity exceeds the supplier maximum.');
	if (e.profit !== null && e.profit <= 0) warnings.push('No profit at this price.');
	if (e.markup !== null && e.markup + 0.01 < row.targetMarkup)
		warnings.push('Below your target profit.');
	try {
		pricingStepPrice(row);
	} catch {
		warnings.push('Pack price and increment do not divide into whole kobo.');
	}
	const rank: Record<string, number> = { value: 0, stable: 1, premium: 2 };
	const siblings = sheet.rows.filter(
		(r) => r.selected && r.id !== row.id && r.platform === row.platform && r.outcome === row.outcome
	);
	if (
		row.selected &&
		siblings.some(
			(r) =>
				r.sale / r.units === row.sale / row.units ||
				(rank[r.tier] - rank[row.tier]) * (r.sale / r.units - row.sale / row.units) < 0
		)
	)
		warnings.push('Check option price order.');
	if (
		row.selected &&
		['likes', 'views'].includes(row.outcome) &&
		sheet.rows.some(
			(r) =>
				r.selected &&
				r.platform === row.platform &&
				['followers', 'subscribers', 'members'].includes(r.outcome) &&
				row.sale / row.units > r.sale / r.units
		)
	)
		warnings.push('Costs more per item than followers.');
	if (row.recoveryMode === 'fallback')
		warnings.push('Configure fallback routes in Advanced setup.');
	return [...new Set(warnings)];
}

export function validatePricingSheet(value: unknown): asserts value is BoostPricingSheet {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid sheet.');
	const s = value as BoostPricingSheet;
	if (
		!Number.isInteger(s.version) ||
		s.version < 0 ||
		!s.settings ||
		!Array.isArray(s.rows) ||
		s.rows.length > 250
	)
		throw new Error('Invalid sheet.');
	const { fx, feePercent, feeFixed, feeConfirmed } = s.settings;
	if (
		!Number.isFinite(fx) ||
		fx <= 0 ||
		fx > 1e6 ||
		!Number.isFinite(feePercent) ||
		feePercent < 0 ||
		feePercent >= 100 ||
		!Number.isFinite(feeFixed) ||
		feeFixed < 0 ||
		feeFixed > 1e7 ||
		typeof feeConfirmed !== 'boolean'
	)
		throw new Error('Check exchange rate and fees.');
	const ids = new Set<string>();
	for (const r of s.rows) {
		if (!r || typeof r !== 'object' || typeof r.id !== 'string' || ids.has(r.id))
			throw new Error('Invalid or duplicate row.');
		ids.add(r.id);
		for (const key of [
			'title',
			'option',
			'platform',
			'outcome',
			'tier',
			'serviceId',
			'note'
		] as const)
			if (typeof r[key] !== 'string' || r[key].length > 2000) throw new Error('Invalid row text.');
		if (
			!['bulk_follows', 'smm_raja'].includes(r.provider) ||
			!['manual', 'target'].includes(r.priceMode) ||
			!['off', 'definitive', 'fallback'].includes(r.recoveryMode) ||
			typeof r.selected !== 'boolean'
		)
			throw new Error('Invalid row choice.');
		for (const key of ['units', 'increment', 'startingQuantity', 'attempts'] as const)
			if (!Number.isSafeInteger(r[key]) || r[key] < 1 || r[key] > 100000000)
				throw new Error('Use positive whole quantities.');
		if (r.attempts > 4) throw new Error('Maximum four attempts.');
		if (
			!Number.isFinite(r.sale) ||
			r.sale < 0 ||
			r.sale > 1e7 ||
			!Number.isFinite(r.targetMarkup) ||
			r.targetMarkup < 0 ||
			r.targetMarkup > 10000 ||
			!Number.isFinite(r.profitBudgetPercent) ||
			r.profitBudgetPercent < 0 ||
			r.profitBudgetPercent > 100
		)
			throw new Error('Check price and profit.');
	}
}

/** Quotes and immutable row identity are never accepted from the browser. */
export function sanitizePricingSheet(
	input: unknown,
	current: BoostPricingSheet
): BoostPricingSheet {
	validatePricingSheet(input);
	if (input.rows.length !== current.rows.length)
		throw new Error('Keep all rows; use the Menu checkbox to hide one.');
	const byId = new Map(current.rows.map((r) => [r.id, r]));
	return {
		version: input.version,
		settings: { ...input.settings },
		rows: input.rows.map((r) => {
			const original = byId.get(r.id);
			if (!original) throw new Error('Unknown row. Reload the sheet.');
			return {
				...original,
				option: r.option.trim(),
				selected: r.selected,
				provider: r.provider,
				serviceId: r.serviceId.trim(),
				units: r.units,
				sale: r.sale,
				targetMarkup: r.targetMarkup,
				priceMode: r.priceMode,
				increment: r.increment,
				startingQuantity: r.startingQuantity,
				recoveryMode: r.recoveryMode,
				profitBudgetPercent: r.profitBudgetPercent,
				attempts: r.attempts,
				note: r.note
			};
		})
	};
}

function csvCell(value: unknown): string {
	const text = String(value ?? '');
	// Spreadsheet formulas must remain text, including leading whitespace/control characters.
	const first = [...text].find((c) => c.trim() !== '' && c.charCodeAt(0) > 31);
	const safe = first && '=+@-'.includes(first) ? "'" + text : text;
	return `"${safe.replaceAll('"', '""')}"`;
}
export function exportPricingCsv(
	sheet: BoostPricingSheet,
	quotes: Record<string, BoostPricingQuote | null>
): string {
	const headers = [
		'Platform',
		'Result',
		'Service',
		'Option',
		'Menu',
		'Supplier',
		'Code',
		'Pack quantity',
		'Cost NGN',
		'Supplier service',
		'USD per 1000',
		'Supplier minimum',
		'Supplier maximum',
		'Target profit %',
		'Selling price NGN',
		'Profit NGN',
		'Actual profit on cost %',
		'Estimated fees NGN',
		'Price mode',
		'Starting quantity',
		'Customer starting quantity',
		'Increment',
		'Recovery',
		'Attempts',
		'Recovery budget %',
		'Note'
	];
	const rows = sheet.rows.map((r) => {
		const e = pricingEconomics(r, sheet, quotes[r.id] ?? null);
		return [
			r.platform,
			r.outcome,
			r.title,
			r.option,
			r.selected ? 'Yes' : 'No',
			r.provider,
			r.serviceId,
			r.units,
			e.cost?.toFixed(2),
			quotes[r.id]?.name,
			quotes[r.id]?.rateUsd,
			quotes[r.id]?.min,
			quotes[r.id]?.max,
			r.targetMarkup,
			r.sale,
			e.profit?.toFixed(2),
			e.markup?.toFixed(2),
			e.fees.toFixed(2),
			r.priceMode,
			r.startingQuantity,
			pricingStart(r, quotes[r.id]?.max ?? null),
			r.increment,
			r.recoveryMode,
			r.attempts,
			r.profitBudgetPercent,
			r.note
		];
	});
	return '\uFEFF' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
