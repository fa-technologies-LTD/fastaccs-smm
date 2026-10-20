import { describe, expect, it } from 'vitest';
import {
	applyTierUnitCostSanitization,
	parseTierUnitCostForForm,
	tierMarginNotes
} from './tier-unit-cost';

describe('tier cost on save', () => {
	it('keeps an existing cost when an older form does not send one', () => {
		expect(applyTierUnitCostSanitization({ name: 'x' }, { unit_cost_ngn: 1_200 })).toEqual({
			name: 'x',
			unit_cost_ngn: 1_200
		});
	});

	it('clears the cost when the box is emptied', () => {
		expect(applyTierUnitCostSanitization({ unit_cost_ngn: '' }, { unit_cost_ngn: 1_200 })).toEqual(
			{}
		);
	});

	it('stores a typed cost as a number and drops invalid values', () => {
		expect(applyTierUnitCostSanitization({ unit_cost_ngn: '950' })).toEqual({ unit_cost_ngn: 950 });
		expect(applyTierUnitCostSanitization({ unit_cost_ngn: '-5' })).toEqual({});
		expect(applyTierUnitCostSanitization({ unit_cost_ngn: 'abc' })).toEqual({});
	});

	it('never lets an admin who cannot see costs set or clear one', () => {
		const existing = { unit_cost_ngn: 1_200 };
		expect(
			applyTierUnitCostSanitization({ unit_cost_ngn: '' }, existing, { canEditCost: false })
		).toEqual({ unit_cost_ngn: 1_200 });
		expect(
			applyTierUnitCostSanitization({ unit_cost_ngn: 5 }, existing, { canEditCost: false })
		).toEqual({ unit_cost_ngn: 1_200 });
		expect(applyTierUnitCostSanitization({ unit_cost_ngn: 5 }, {}, { canEditCost: false })).toEqual(
			{}
		);
	});

	it('fills the admin form with the saved cost or an empty box', () => {
		expect(parseTierUnitCostForForm({ unit_cost_ngn: 700 })).toBe(700);
		expect(parseTierUnitCostForForm({})).toBe('');
	});
});

describe('margin advice under the cost box', () => {
	it('explains a missing cost', () => {
		expect(tierMarginNotes({ priceNgn: 5_000, unitCostNgn: '' }).notes[0].text).toMatch(
			/Super order earnings on this tier are held/
		);
	});

	it('shows the margin, and flags thin, very thin and loss-making tiers', () => {
		expect(tierMarginNotes({ priceNgn: 5_000, unitCostNgn: 2_000 })).toEqual({
			marginPercent: 60,
			profitNgn: 3_000,
			notes: [{ level: 'info', text: 'Margin 60% · ₦3,000 per account.' }]
		});
		expect(tierMarginNotes({ priceNgn: 5_000, unitCostNgn: 3_500 }).notes[1]).toMatchObject({
			level: 'warning',
			text: expect.stringMatching(/^Thin margin \(30%\)/)
		});
		expect(tierMarginNotes({ priceNgn: 5_000, unitCostNgn: 4_500 }).notes[1].text).toMatch(
			/affiliate offer/
		);
		expect(
			tierMarginNotes({ priceNgn: 5_000, unitCostNgn: 4_500, affiliateExcluded: true }).notes[1]
				.text
		).toMatch(/any discount or store credit/);
		expect(tierMarginNotes({ priceNgn: 5_000, unitCostNgn: 5_400 }).notes[1]).toEqual({
			level: 'error',
			text: 'Cost is above the price: each sale loses ₦400.'
		});
	});
});
