export interface CheckoutQuote {
	subtotal: number;
	discount: number;
	total: number;
	creditApplied: number;
	payable: number;
	linePrices: number[];
}

const cents = (n: unknown) =>
	typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;

/** Client amounts are consent assertions only, never the source of prices or debits. */
export function matchesCheckoutQuote(expected: unknown, actual: CheckoutQuote): boolean {
	if (!expected || typeof expected !== 'object') return false;
	const quote = expected as CheckoutQuote;
	return (
		(['subtotal', 'discount', 'total', 'creditApplied', 'payable'] as const).every(
			(key) => cents(quote[key]) === cents(actual[key])
		) &&
		Array.isArray(quote.linePrices) &&
		quote.linePrices.length === actual.linePrices.length &&
		quote.linePrices.every((price, i) => cents(price) === cents(actual.linePrices[i]))
	);
}
