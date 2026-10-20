import { describe, expect, it } from 'vitest';
import { applyTierUnitCostSanitization, parseTierUnitCostForForm } from './tier-unit-cost';

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
