export interface NumbersPricingBaseline {
	active: boolean;
	mode: 'auto' | 'manual';
	sale: number;
	signature: string;
}
export interface NumbersPricingRow {
	id: string;
	active: boolean;
	mode: 'auto' | 'manual';
	sale: number;
	targetMarkup: number;
	baseline: NumbersPricingBaseline;
}
export interface NumbersPricingSheet {
	version: number;
	rows: NumbersPricingRow[];
}
export interface NumbersPricingQuote {
	app: string;
	country: string;
	serviceId: number;
	countryId: number;
	provider: string;
	costCents: number;
	available: number;
	autoHidden: boolean;
	hideReason: string | null;
	minimumProfit: number;
	checkedAt: string | null;
	live: NumbersPricingBaseline;
}
export interface NumbersPricingView {
	sheet: NumbersPricingSheet;
	fx: number;
	defaultMarkup: number;
	quotes: Record<string, NumbersPricingQuote>;
	history: Array<{ id: string; action: string; createdAt: string; version: number }>;
}
export function numbersRowChanged(row: NumbersPricingRow): boolean {
	return (
		row.active !== row.baseline.active ||
		row.mode !== row.baseline.mode ||
		(row.mode === 'manual' && row.sale !== row.baseline.sale)
	);
}
export function numbersEconomics(
	row: NumbersPricingRow,
	quote: NumbersPricingQuote | undefined,
	fx: number
) {
	const cost = quote && quote.costCents > 0 ? (quote.costCents * fx) / 100 : null;
	const sale = row.mode === 'auto' ? (quote?.live.sale ?? row.sale) : row.sale;
	const profit = cost === null ? null : sale - cost;
	return { cost, sale, profit, markup: cost && profit !== null ? (profit / cost) * 100 : null };
}
export function numbersTargetPrice(costCents: number, fx: number, markup: number): number | null {
	if (
		![costCents, fx, markup].every(Number.isFinite) ||
		costCents <= 0 ||
		fx <= 0 ||
		markup < 0 ||
		markup > 100000
	)
		return null;
	return Math.max(
		1000,
		Math.ceil((((costCents * fx) / 100) * (1 + markup / 100) - 1e-9) / 100) * 100
	);
}
export function numbersPricingWarnings(
	row: NumbersPricingRow,
	quote: NumbersPricingQuote | undefined,
	fx: number
): string[] {
	if (!quote) return ['This number is no longer in the catalogue.'];
	const warnings: string[] = [];
	if (numbersRowChanged(row) && row.baseline.signature !== quote.live.signature)
		warnings.push('Live settings changed. Reload before publishing.');
	if (quote.autoHidden)
		warnings.push(
			quote.hideReason === 'low_success' ? 'Hidden: low delivery success.' : 'Hidden: no stock.'
		);
	const e = numbersEconomics(row, quote, fx);
	if (
		row.mode === 'manual' &&
		(row.sale < 1000 || !Number.isInteger(row.sale) || row.sale % 100 !== 0)
	)
		warnings.push('Use a price of at least ₦1,000, in ₦100 steps.');
	if (row.active && (e.profit === null || e.profit + 1e-7 < quote.minimumProfit))
		warnings.push('Price does not cover the Numbers profit safeguard.');
	return warnings;
}
export function exportNumbersPricingCsv(view: NumbersPricingView): string {
	const cell = (value: unknown) => {
		let text = String(value ?? '');
		if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const rows: unknown[][] = [
		[
			'App',
			'Country',
			'Service code',
			'Country code',
			'Supplier source',
			'Enabled',
			'Mode',
			'Supplier cost USD',
			'Estimated cost NGN',
			'Target profit %',
			'Customer price NGN',
			'Estimated profit NGN',
			'Estimated profit %',
			'Minimum profit NGN',
			'Stock',
			'Auto hidden',
			'Cost checked at'
		]
	];
	for (const row of view.sheet.rows) {
		const q = view.quotes[row.id],
			e = numbersEconomics(row, q, view.fx);
		rows.push([
			q?.app,
			q?.country,
			q?.serviceId,
			q?.countryId,
			q?.provider,
			row.active ? 'Yes' : 'No',
			row.mode,
			q ? q.costCents / 100 : '',
			e.cost,
			row.targetMarkup,
			e.sale,
			e.profit,
			e.markup,
			q?.minimumProfit,
			q?.available,
			q?.autoHidden ? 'Yes' : 'No',
			q?.checkedAt
		]);
	}
	return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
