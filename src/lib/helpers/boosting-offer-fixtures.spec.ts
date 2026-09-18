import { describe, expect, it } from 'vitest';
import { getPreviewQuantityPresets } from './boosting-offer-fixtures';

describe('Boosting preview quantity presets', () => {
	it('shows actual quantities that preserve the configured unit increment', () => {
		expect(getPreviewQuantityPresets(50)).toEqual([50, 100, 250, 500]);
		expect(getPreviewQuantityPresets(500)).toEqual([500, 1000, 2500, 5000]);
	});

	it('fails closed for malformed quantities', () => {
		expect(getPreviewQuantityPresets(0)).toEqual([]);
		expect(getPreviewQuantityPresets(2.5)).toEqual([]);
	});
});
