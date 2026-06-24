import { describe, expect, it } from 'vitest';
import {
	computeBoostingPrice,
	getBoostingServiceConfig,
	getQuantityChips,
	isValidBoostingQuantity
} from './boosting-service-config';

const baseConfig = getBoostingServiceConfig({
	boosting_platform: 'instagram',
	boosting_action_type: 'followers',
	boosting_min_quantity: 500,
	boosting_step_quantity: 500,
	boosting_price_per_step: 1000
});

describe('boosting service config', () => {
	it('accepts quantities at the minimum and at each step beyond it', () => {
		expect(isValidBoostingQuantity(baseConfig, 500)).toBe(true);
		expect(isValidBoostingQuantity(baseConfig, 1000)).toBe(true);
		expect(isValidBoostingQuantity(baseConfig, 1500)).toBe(true);
	});

	it('rejects quantities below the minimum or off-step', () => {
		expect(isValidBoostingQuantity(baseConfig, 250)).toBe(false);
		expect(isValidBoostingQuantity(baseConfig, 750)).toBe(false);
	});

	it('computes price as a linear multiple of the per-step rate', () => {
		expect(computeBoostingPrice(baseConfig, 500)).toBe(1000);
		expect(computeBoostingPrice(baseConfig, 1000)).toBe(2000);
		expect(computeBoostingPrice(baseConfig, 1500)).toBe(3000);
	});

	it('returns NaN for an invalid quantity so callers never silently charge the wrong price', () => {
		expect(Number.isNaN(computeBoostingPrice(baseConfig, 750))).toBe(true);
	});

	it('falls back to safe defaults for missing/malformed metadata', () => {
		const config = getBoostingServiceConfig(null);
		expect(config.platform).toBe('instagram');
		expect(config.actionType).toBe('followers');
		expect(config.refillAvailable).toBe(false);
		expect(config.refillDays).toBeNull();
	});

	it('only carries a refillDays value when refillAvailable is true', () => {
		const withRefill = getBoostingServiceConfig({ boosting_refill_available: true, boosting_refill_days: 14 });
		expect(withRefill.refillDays).toBe(14);

		const withoutRefill = getBoostingServiceConfig({ boosting_refill_days: 14 });
		expect(withoutRefill.refillAvailable).toBe(false);
		expect(withoutRefill.refillDays).toBeNull();
	});

	it('builds quantity quick-select chips as valid, ascending multiples of the step', () => {
		const chips = getQuantityChips(baseConfig);
		expect(chips).toEqual([500, 1000, 2500, 5000]);
		for (const chip of chips) {
			expect(isValidBoostingQuantity(baseConfig, chip)).toBe(true);
		}
	});

	it('dedupes quantity chips for small min/step ratios', () => {
		const tightConfig = getBoostingServiceConfig({
			boosting_min_quantity: 1000,
			boosting_step_quantity: 1000
		});
		const chips = getQuantityChips(tightConfig);
		expect(new Set(chips).size).toBe(chips.length);
	});
});
