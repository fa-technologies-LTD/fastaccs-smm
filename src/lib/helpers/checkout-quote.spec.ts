import { expect, it } from 'vitest';
import { matchesCheckoutQuote, type CheckoutQuote } from './checkout-quote';
import { computeOrderRedemption } from './store-credit-redemption';
const quote: CheckoutQuote = {
	subtotal: 500,
	discount: 0,
	total: 500,
	creditApplied: 0,
	payable: 500,
	linePrices: [500]
};
it('requires every displayed amount and line to match the authoritative quote', () => {
	expect(matchesCheckoutQuote(quote, quote)).toBe(true);
	for (const key of ['subtotal', 'discount', 'total', 'creditApplied', 'payable'] as const)
		expect(matchesCheckoutQuote({ ...quote, [key]: quote[key] + 0.01 }, quote)).toBe(false);
	expect(matchesCheckoutQuote({ ...quote, linePrices: [1] }, quote)).toBe(false);
	expect(matchesCheckoutQuote(null, quote)).toBe(false);
	expect(matchesCheckoutQuote({ ...quote, payable: NaN }, quote)).toBe(false);
});
it('preserves refund kobo without spending fractional earned credit', () => {
	expect(computeOrderRedemption(500, { refundAvailable: 499.5, earnedAvailable: 100 })).toEqual({
		refundApplied: 499.5,
		earnedApplied: 0,
		totalApplied: 499.5
	});
	expect(
		computeOrderRedemption(1000, { refundAvailable: 0, earnedAvailable: 999.999 }).totalApplied
	).toBe(300);
});
