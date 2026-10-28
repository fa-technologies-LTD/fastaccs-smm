import { describe, expect, it } from 'vitest';
import { applyTierSettingsPatch, parseTierSettingsPatch } from './tier-settings-patch';

const saved = {
	delivery_mode: 'manual_handover',
	manual_available: true,
	pricing: { base_price: 5000, currency: 'NGN' },
	features: ['Aged'],
	unit_cost_ngn: 3000,
	is_pinned: true
};

describe('changing one account-type setting', () => {
	it('flips only the WhatsApp availability switch', () => {
		const next = applyTierSettingsPatch(saved, { manualAvailable: false }, { canEditCost: false });
		expect(next.manual_available).toBe(false);
		expect(next.pricing).toEqual(saved.pricing);
		expect(next.features).toEqual(['Aged']);
		expect(next.unit_cost_ngn).toBe(3000);
		expect(next.is_pinned).toBe(true);
	});

	it('sets the price on the ₦50 grid and keeps everything else', () => {
		const next = applyTierSettingsPatch(saved, { basePrice: 6020 }, { canEditCost: true });
		expect(next.pricing).toEqual({ base_price: 6000, currency: 'NGN' });
		expect(next.unit_cost_ngn).toBe(3000);
	});

	it('sets or clears the cost only for people who can see costs', () => {
		expect(
			applyTierSettingsPatch(saved, { unitCostNgn: 3500 }, { canEditCost: true }).unit_cost_ngn
		).toBe(3500);
		expect(
			'unit_cost_ngn' in applyTierSettingsPatch(saved, { unitCostNgn: null }, { canEditCost: true })
		).toBe(false);
		expect(
			applyTierSettingsPatch(saved, { unitCostNgn: 1 }, { canEditCost: false }).unit_cost_ngn
		).toBe(3000);
	});

	it('rejects empty or invalid changes', () => {
		expect(parseTierSettingsPatch({})).toEqual({ error: 'Nothing to change.' });
		expect(parseTierSettingsPatch({ basePrice: 0 })).toEqual({ error: 'Enter a price above ₦0.' });
		expect(parseTierSettingsPatch({ manualAvailable: 'yes' })).toEqual({
			error: 'manualAvailable must be true or false.'
		});
		expect(parseTierSettingsPatch({ unitCostNgn: '' })).toEqual({ patch: { unitCostNgn: null } });
	});
});
