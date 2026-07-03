import { describe, expect, it } from 'vitest';
import {
	getTierStockStatus,
	getTierDeliveryConfig,
	applyTierDeliveryConfigSanitization,
	TIER_MANUAL_AVAILABLE_KEY
} from './tier-delivery-config';

describe('getTierStockStatus', () => {
	it('instant tier is available only with account stock, shown as a count', () => {
		const meta = { delivery_mode: 'instant_auto' };
		expect(getTierStockStatus(meta, 5)).toEqual({ isManual: false, available: true, showAsCount: true });
		expect(getTierStockStatus(meta, 0)).toEqual({ isManual: false, available: false, showAsCount: true });
	});

	it('manual tier ignores account count — availability is the toggle', () => {
		// Default (no flag) → available.
		expect(getTierStockStatus({ delivery_mode: 'manual_handover' }, 0)).toEqual({
			isManual: true,
			available: true,
			showAsCount: false
		});
		// Explicitly unavailable.
		expect(
			getTierStockStatus({ delivery_mode: 'manual_handover', manual_available: false }, 999)
		).toEqual({ isManual: true, available: false, showAsCount: false });
	});
});

describe('manual_available persistence', () => {
	it('config defaults manualAvailable to true unless explicitly false', () => {
		expect(getTierDeliveryConfig({ delivery_mode: 'manual_handover' }).manualAvailable).toBe(true);
		expect(
			getTierDeliveryConfig({ delivery_mode: 'manual_handover', manual_available: false })
				.manualAvailable
		).toBe(false);
	});

	it('sanitization keeps manual_available for manual tiers and strips it otherwise', () => {
		const manual = applyTierDeliveryConfigSanitization({
			delivery_mode: 'manual_handover',
			manual_available: false
		});
		expect(manual[TIER_MANUAL_AVAILABLE_KEY]).toBe(false);

		const instant = applyTierDeliveryConfigSanitization({
			delivery_mode: 'instant_auto',
			manual_available: false
		});
		expect(instant[TIER_MANUAL_AVAILABLE_KEY]).toBeUndefined();
	});
});
