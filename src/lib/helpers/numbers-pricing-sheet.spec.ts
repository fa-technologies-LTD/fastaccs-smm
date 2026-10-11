import { expect, it } from 'vitest';
import { numbersFixture } from './numbers-pricing-sheet-fixtures';
import {
	numbersEconomics,
	numbersRowChanged,
	numbersTargetPrice,
	numbersPricingWarnings,
	exportNumbersPricingCsv
} from './numbers-pricing-sheet';

it('calculates estimated cost/profit for one number without changing existing automatic pricing', () => {
	const v = numbersFixture(),
		r = v.sheet.rows[0];
	expect(numbersEconomics(r, v.quotes.number, v.fx)).toMatchObject({
		cost: 750,
		sale: 2000,
		profit: 1250
	});
	r.sale = 9000;
	expect(numbersEconomics(r, v.quotes.number, v.fx).sale).toBe(2000);
	expect(numbersRowChanged(r)).toBe(false);
	r.mode = 'manual';
	expect(numbersRowChanged(r)).toBe(true);
	expect(numbersEconomics(r, v.quotes.number, v.fx).sale).toBe(9000);
});
it('rounds the target calculator to existing Numbers ₦100 steps and ₦1,000 minimum', () => {
	expect(numbersTargetPrice(50, 1500, 100)).toBe(1500);
	expect(numbersTargetPrice(1, 1500, 50)).toBe(1000);
	expect(numbersTargetPrice(51, 1500, 100)).toBe(1600);
	expect(numbersTargetPrice(0, 1500, 100)).toBeNull();
	expect(numbersTargetPrice(50, NaN, 100)).toBeNull();
});
it('flags a unsafe manual price and retains automatic stock hiding', () => {
	const v = numbersFixture(),
		r = v.sheet.rows[0];
	r.mode = 'manual';
	r.sale = 1000;
	v.quotes.number.autoHidden = true;
	v.quotes.number.hideReason = 'low_success';
	expect(numbersPricingWarnings(r, v.quotes.number, v.fx)).toEqual([
		'Hidden: low delivery success.',
		'Price does not cover the Numbers profit safeguard.'
	]);
});
it('exports current edits and neutralizes spreadsheet formulas/quotes/newlines', () => {
	const v = numbersFixture();
	v.sheet.rows[0].mode = 'manual';
	v.sheet.rows[0].sale = 2500;
	v.quotes.number.app = '=HYPERLINK("https://evil")';
	v.quotes.number.country = 'A, "B"\nC';
	const csv = exportNumbersPricingCsv(v);
	expect(csv).toContain("'=");
	expect(csv).toContain('"A, ""B""\nC"');
	expect(csv).toContain('"2500"');
	expect(csv).toContain('"1750"');
});
