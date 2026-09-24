import { describe, expect, it } from 'vitest';

import { applyTierCatalogPriceSanitization, roundCatalogPriceNgn } from './catalog-pricing';

describe('catalogue price rounding', () => {
	it.each([
		[0, 0],
		[1_700, 1_700],
		[1_724, 1_700],
		[1_725, 1_750],
		[1_776, 1_800]
	])('rounds ₦%s to ₦%s', (input, expected) => {
		expect(roundCatalogPriceNgn(input)).toBe(expected);
	});

	it('rounds both current and legacy account-tier price fields without changing other metadata', () => {
		expect(
			applyTierCatalogPriceSanitization({
				pricing: { base_price: 1_725, currency: 'NGN' },
				price: 2_024,
				features: ['Aged']
			})
		).toEqual({
			pricing: { base_price: 1_750, currency: 'NGN' },
			price: 2_000,
			features: ['Aged']
		});
	});
});
