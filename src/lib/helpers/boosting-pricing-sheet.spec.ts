import { describe, expect, it } from 'vitest';
import {
	exportPricingCsv,
	pricingDisplayAmount,
	pricingStoredAmount,
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
	it.each([10, 100, 1000])(
		'compares prices and economics per 1,000 without changing a saved %s-unit rule',
		(units) => {
			const legacy = { ...row, units, sale: 15 * units, startingQuantity: 500, increment: 500 };
			const snapshot = JSON.stringify(legacy);
			const economics = pricingEconomics(legacy, sheet, quote);
			expect(pricingDisplayAmount(legacy, legacy.sale)).toBe(15000);
			expect(pricingDisplayAmount(legacy, economics.cost)).toBe(81);
			expect(pricingDisplayAmount(legacy, economics.profit)).toBe(14919);
			expect(pricingStoredAmount(legacy, 15000.02)).toBeCloseTo(15.00002 * units, 9);
			expect(pricingStepPrice({ ...legacy, sale: pricingStoredAmount(legacy, 15000.02) })).toBe(
				7500.01
			);
			expect(pricingStepPrice(legacy)).toBe(7500);
			expect(JSON.stringify(legacy)).toBe(snapshot);
		}
	);
	it('does not make unknown display costs free or round an untouched fractional pricing basis', () => {
		const legacy = { ...row, units: 10, sale: 150.0002, increment: 500 };
		expect(pricingDisplayAmount(legacy, null)).toBeNull();
		expect(pricingDisplayAmount(legacy, NaN)).toBeNull();
		expect(pricingDisplayAmount(legacy, legacy.sale)).toBe(15000.02);
		expect(pricingStoredAmount(legacy, 15000.02)).toBe(150.0002);
		expect(pricingStepPrice(legacy)).toBe(7500.01);
	});
	it('exports matching per-1,000 prices, costs and profit with the saved basis retained for reference', () => {
		const legacy = { ...row, units: 10, sale: 150, increment: 500 };
		const csv = exportPricingCsv({ ...sheet, rows: [legacy] }, { row: quote });
		const [headers, values] = csv
			.slice(1)
			.split('\r\n')
			.map((line) => line.split(',').map((value) => value.slice(1, -1)));
		const exported = Object.fromEntries(headers.map((header, i) => [header, values[i]]));
		expect(exported).toMatchObject({
			'Pricing quantity': '1000',
			'Cost NGN per 1000': '81.00',
			'Selling price NGN per 1000': '15000',
			'Profit NGN per 1000': '14919.00',
			'Saved rule quantity': '10',
			'Price per saved rule quantity NGN': '150'
		});
	});
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
