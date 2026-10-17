import { expect, it } from 'vitest';
import { supplierPackCost } from './boosting-supplier-details';
it('uses the visible pricing quantity and current draft dollar rate', () => {
	expect(supplierPackCost(0.2, 1500, 1000)).toBe(300);
	expect(supplierPackCost(0.2, 2000, 100)).toBe(40);
	expect(supplierPackCost(0, 1500, 1000)).toBe(0);
});
it('keeps missing or invalid costs unknown rather than treating them as free', () => {
	for (const cost of [null, NaN, Infinity, -1])
		expect(supplierPackCost(cost, 1500, 1000)).toBeNull();
	expect(supplierPackCost(1, 0, 1000)).toBeNull();
	expect(supplierPackCost(1, 1500, 0)).toBeNull();
	expect(supplierPackCost(1e308, 1500, 1000)).toBeNull();
});
