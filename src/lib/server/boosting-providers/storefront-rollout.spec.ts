import { describe, expect, it } from 'vitest';
import { isBoostingManagedStorefrontEnabled } from './storefront-rollout';

describe('Boosting managed storefront rollout', () => {
	it('keeps the legacy storefront before the deliberate cutover', () => {
		expect(isBoostingManagedStorefrontEnabled(null, false)).toBe(false);
	});

	it('cuts over when an eligible live offer exists', () => {
		expect(isBoostingManagedStorefrontEnabled(null, true)).toBe(true);
	});

	it('stays cut over after offers are deliberately taken offline', () => {
		expect(isBoostingManagedStorefrontEnabled({ value: 'true', isActive: true }, false)).toBe(true);
	});

	it('does not trust an inactive or false flag', () => {
		expect(isBoostingManagedStorefrontEnabled({ value: 'true', isActive: false }, false)).toBe(
			false
		);
		expect(isBoostingManagedStorefrontEnabled({ value: 'false', isActive: true }, false)).toBe(
			false
		);
	});
});
