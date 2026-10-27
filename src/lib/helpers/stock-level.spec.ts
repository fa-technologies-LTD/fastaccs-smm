import { describe, expect, it } from 'vitest';
import { isLowStock, isOutOfStock } from './stock-level';

describe('stock level', () => {
	it('counts "3 or fewer" as 3 or fewer, never 0', () => {
		expect([0, 1, 2, 3, 4].map((n) => isLowStock(n, 3))).toEqual([false, true, true, true, false]);
	});
	it('treats a threshold below 1 as 1', () => {
		expect(isLowStock(1, 0)).toBe(true);
		expect(isLowStock(2, 0)).toBe(false);
	});
	it('is out of stock only at zero', () => {
		expect(isOutOfStock(0)).toBe(true);
		expect(isOutOfStock(1)).toBe(false);
	});
});
