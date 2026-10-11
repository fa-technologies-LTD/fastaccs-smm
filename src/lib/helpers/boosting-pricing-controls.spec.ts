import { expect, it } from 'vitest';
import { sheet, row, quote } from './boosting-pricing-sheet-fixtures';
import {
	boostAutoPrice,
	boostControlSignature,
	validateBoostRules
} from './boosting-pricing-controls';

it('combines markup with profit targets and clean rounding', () => {
	expect(boostAutoPrice(row, sheet, quote)).toBe(150);
	expect(
		boostAutoPrice(row, { ...sheet, settings: { ...sheet.settings, profitTargetNgn: 200 } }, quote)
	).toBe(300);
});
it('allows a default percentage and intentional per-offer overrides', () => {
	const s = { ...sheet, settings: { ...sheet.settings, defaultMarkup: 500 } };
	expect(boostAutoPrice({ ...row, useDefaultMarkup: true }, s, quote)).toBe(500);
	expect(boostAutoPrice({ ...row, useDefaultMarkup: false }, s, quote)).toBe(150);
});
it('profit protection wins over the competitive cap', () => {
	expect(
		boostAutoPrice(
			row,
			{ ...sheet, settings: { ...sheet.settings, hardProfitNgn: 300, maxPriceMultiple: 2 } },
			quote
		)
	).toBe(400);
});
it('does not invent a price when supplier costs are missing', () => {
	expect(boostAutoPrice(row, sheet, null)).toBeNull();
});
it('includes verified fee estimates without inventing an extra fee charge', () => {
	expect(
		boostAutoPrice(
			row,
			{
				...sheet,
				settings: { ...sheet.settings, feeConfirmed: true, feePercent: 10, feeFixed: 50 }
			},
			quote
		)
	).toBe(200);
});
it('rejects invalid rules rather than silently applying defaults', () => {
	expect(() => validateBoostRules({ ...sheet.settings, hardProfitNgn: NaN })).toThrow();
	expect(() => validateBoostRules({ ...sheet.settings, maxPriceMultiple: 0.5 })).toThrow();
});
it('excludes supplier routes and evidence from commercial edit detection', () => {
	expect(boostControlSignature(row)).toBe(boostControlSignature({ ...row, serviceId: 'another' }));
	expect(boostControlSignature(row)).not.toBe(boostControlSignature({ ...row, sale: 900 }));
});
