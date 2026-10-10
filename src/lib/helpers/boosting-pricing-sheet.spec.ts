import { describe, expect, it } from 'vitest';
import {
	exportPricingCsv,
	pricingEconomics,
	pricingStart,
	pricingStepPrice,
	pricingTarget,
	pricingWarnings,
	sanitizePricingSheet,
	validatePricingSheet
} from './boosting-pricing-sheet';

import { row, sheet, quote } from './boosting-pricing-sheet-fixtures';

describe('Boosting Pricing sheet', () => {
	it('costs the pack independently from its increment', () => {
		expect(pricingEconomics(row, sheet, quote)).toMatchObject({
			cost: 81,
			profit: 419,
			fees: 0,
			recoveryBudget: 83.8
		});
		expect(pricingStepPrice(row)).toBe(50);
	});
	it('raises cheap starting quantity to ₦500 without changing the grid', () => {
		expect(pricingStart(row, 100000)).toBe(1000);
		expect(row.increment).toBe(100);
	});
	it('does not turn an unknown supplier price into free profit', () => {
		expect(pricingEconomics(row, sheet, null)).toMatchObject({
			cost: null,
			profit: null,
			markup: null
		});
		expect(pricingTarget(row, sheet, null)).toBeNull();
	});
	it('applies estimated fees before rounding a target price up to ₦50', () => {
		const s = {
			...sheet,
			settings: { ...sheet.settings, feePercent: 2, feeFixed: 50, feeConfirmed: true }
		};
		expect(pricingTarget(row, s, quote)).toBe(200);
		expect(pricingEconomics(row, s, quote)).toMatchObject({ fees: 60, profit: 359 });
	});
	it('never overwrites a deliberately entered selling price during calculations', () => {
		pricingTarget(row, sheet, quote);
		expect(row.sale).toBe(500);
	});
	it('rejects a price/increment combination that loses fractional kobo', () => {
		expect(() => pricingStepPrice({ ...row, units: 3, increment: 1, sale: 500 })).toThrow(
			'represented exactly'
		);
	});
	it('preserves identity and source revisions rather than accepting client forgery', () => {
		const input = structuredClone(sheet);
		input.rows[0].platform = 'instagram';
		input.rows[0].sourceOfferId = 'forged';
		input.rows[0].sourceUpdatedAt = 'new';
		input.rows[0].sale = 900;
		const safe = sanitizePricingSheet(input, sheet);
		expect(safe.rows[0]).toMatchObject({
			platform: 'tiktok',
			sourceOfferId: 'offer',
			sourceUpdatedAt: row.sourceUpdatedAt,
			sale: 900
		});
	});
	it('rejects removed, unknown and duplicate rows', () => {
		expect(() => sanitizePricingSheet({ ...sheet, rows: [] }, sheet)).toThrow('Keep all');
		expect(() =>
			sanitizePricingSheet({ ...sheet, rows: [{ ...row, id: 'unknown' }] }, sheet)
		).toThrow('Unknown');
		expect(() => validatePricingSheet({ ...sheet, rows: [row, row] })).toThrow('duplicate');
	});
	it('rejects malformed settings and non-whole quantities', () => {
		expect(() =>
			validatePricingSheet({ ...sheet, settings: { ...sheet.settings, feePercent: 100 } })
		).toThrow();
		expect(() => validatePricingSheet({ ...sheet, rows: [{ ...row, increment: 1.5 }] })).toThrow();
	});
	it('exports exact prices and neutralizes spreadsheet formulas', () => {
		const csv = exportPricingCsv(
			{ ...sheet, rows: [{ ...row, note: ' =HYPERLINK("bad")' }] },
			{ row: quote }
		);
		expect(csv).toContain('"81.00"');
		expect(csv).toContain('"500"');
		expect(csv).toContain('"\' =HYPERLINK(""bad"")"');
		expect(csv.startsWith('\uFEFF')).toBe(true);
		const columns = csv.split('\r\n').map((line) => line.match(/"(?:[^"]|"")*"/g)?.length);
		expect(columns[1]).toBe(columns[0]);
	});
	it('flags reversed tiers at equal quantity, not misleading pack totals', () => {
		const expensive = { ...row, id: 'premium', tier: 'premium', units: 2000, sale: 800 };
		expect(pricingWarnings(row, { ...sheet, rows: [row, expensive] }, quote)).toContain(
			'Check option price order.'
		);
	});
	it('lets intentional manual margin differences remain advisory', () => {
		expect(pricingWarnings({ ...row, targetMarkup: 1000 }, sheet, quote)).toContain(
			'Below your target profit.'
		);
	});
});
