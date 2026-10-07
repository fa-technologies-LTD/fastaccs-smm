import { describe, expect, it } from 'vitest';
import { boostingMinimumMessage, boostingStartingQuantity } from './boosting-checkout';

describe('Boosting minimum checkout', () => {
	it('starts a cheap offer at the first valid quantity displayed as ₦500', () => {
		expect(
			boostingStartingQuantity({
				minQuantity: 100,
				stepQuantity: 100,
				maxQuantity: 10000,
				pricePerStepNgn: 50
			})
		).toBe(1000);
	});
	it('preserves an offset supplier grid and respects its maximum', () => {
		expect(
			boostingStartingQuantity({
				minQuantity: 10,
				stepQuantity: 200,
				maxQuantity: 10000,
				pricePerStepNgn: 50
			})
		).toBe(2010);
		expect(
			boostingStartingQuantity({
				minQuantity: 10,
				stepQuantity: 200,
				maxQuantity: 1000,
				pricePerStepNgn: 50
			})
		).toBe(810);
	});
	it('keeps an existing starting quantity when its total meets the floor', () => {
		expect(
			boostingStartingQuantity({
				minQuantity: 200,
				stepQuantity: 100,
				maxQuantity: 1000,
				pricePerStepNgn: 300
			})
		).toBe(200);
	});
	it('checks the combined cart total, including the exact boundary', () => {
		expect(boostingMinimumMessage(300 + 200)).toBeNull();
		expect(boostingMinimumMessage(350)).toBe('Add ₦150 more in Boosting to check out.');
		expect(boostingMinimumMessage(499.99)).toBe('Add ₦0.01 more in Boosting to check out.');
	});
});
