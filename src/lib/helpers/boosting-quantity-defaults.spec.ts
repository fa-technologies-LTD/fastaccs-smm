import { expect, it } from 'vitest';
import { standardBoostQuantityDefaults } from './boosting-quantity-defaults';
import { boostingStartingQuantity } from './boosting-checkout';
it('defines the requested base minima and increments', () => {
	expect(standardBoostQuantityDefaults('comments')).toEqual({ minimum: 10, step: 10 });
	expect(standardBoostQuantityDefaults('custom_comments')).toEqual({ minimum: 10, step: 10 });
	expect(standardBoostQuantityDefaults('likes')).toEqual({ minimum: 200, step: 200 });
	expect(standardBoostQuantityDefaults('followers')).toEqual({ minimum: 500, step: 500 });
});
it('never goes below a supplier minimum and keeps the normal step unchanged', () => {
	expect(standardBoostQuantityDefaults('followers', 1000)).toEqual({ minimum: 1000, step: 500 });
	expect(standardBoostQuantityDefaults('comments', 25)).toEqual({ minimum: 30, step: 10 });
});
it('does not invent defaults for other outcomes or invalid constraints', () => {
	expect(standardBoostQuantityDefaults('views')).toBeNull();
	expect(standardBoostQuantityDefaults('likes', NaN)).toBeNull();
});
it('raises cheap starting totals without changing the normal step', () => {
	const q = standardBoostQuantityDefaults('comments')!;
	const offer = {
		minQuantity: q.minimum,
		stepQuantity: q.step,
		maxQuantity: null,
		pricePerStepNgn: 25
	};
	expect(boostingStartingQuantity(offer)).toBe(190);
	expect(offer.stepQuantity).toBe(10);
});
