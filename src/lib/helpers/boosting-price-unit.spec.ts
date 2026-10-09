import { describe, expect, it } from 'vitest';
import { rebaseLockedBoostingPrice, suggestBoostingPricePerStep } from './boosting-price-unit';
describe('precise Boosting price increments', () => {
	it('does not apply a ₦50 floor to every individual comment or ten likes', () => {
		expect(
			suggestBoostingPricePerStep({
				supplierCostNgn: 100,
				quantity: 100,
				stepQuantity: 1,
				profitPercent: 30
			})
		).toBe(1.3);
		expect(
			suggestBoostingPricePerStep({
				supplierCostNgn: 64.35,
				quantity: 1000,
				stepQuantity: 10,
				profitPercent: 50
			})
		).toBe(0.97);
	});
	it('rounds upwards to kobo without altering manually entered prices', () => {
		expect(
			suggestBoostingPricePerStep({
				supplierCostNgn: 2.918,
				quantity: 10,
				stepQuantity: 10,
				profitPercent: 500
			})
		).toBe(17.51);
	});
	it('fails closed without a valid supplier cost or quantity', () => {
		expect(
			suggestBoostingPricePerStep({
				supplierCostNgn: 0,
				quantity: 100,
				stepQuantity: 10,
				profitPercent: 30
			})
		).toBe(0);
	});
});

describe('locked Boosting price when changing the quantity increment', () => {
	it.each([
		[2500, 1000, 10, 25],
		[1350, 1000, 10, 13.5],
		[5, 10, 100, 50],
		[50, 10, 1000, 5000]
	])(
		'preserves the price per unit (%s per %s to increments of %s)',
		(price, oldStep, newStep, expected) => {
			expect(rebaseLockedBoostingPrice(price, oldStep, newStep)).toBe(expected);
			expect(rebaseLockedBoostingPrice(expected, newStep, oldStep)).toBe(price);
		}
	);
	it('refuses to distort the unit rate through fractional-kobo rounding', () => {
		expect(rebaseLockedBoostingPrice(0.01, 1000, 10)).toBeNull();
		expect(rebaseLockedBoostingPrice(1, 3, 1)).toBeNull();
	});
	it.each([
		[0, 100, 10],
		[-1, 100, 10],
		[NaN, 100, 10],
		[1.001, 10, 100],
		[1, 0, 10],
		[1, 10, 0],
		[1, 1.5, 10],
		[1, 10, Infinity]
	])('rejects invalid prices and increments', (price, oldStep, newStep) => {
		expect(rebaseLockedBoostingPrice(price, oldStep, newStep)).toBeNull();
	});
});
