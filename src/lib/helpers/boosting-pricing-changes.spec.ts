import { expect, it } from 'vitest';
import { sheet } from './boosting-pricing-sheet-fixtures';
import { boostingPricingChanges } from './boosting-pricing-changes';

it('lists price, locks, Live changes and rules in one review without mutating either input', () => {
	const before = structuredClone(sheet);
	const after = structuredClone(before);
	after.settings.fx = 2000;
	after.rows[0].sale = 950;
	after.rows[0].priceMode = 'target';
	after.rows[0].selected = false;
	const snapshot = JSON.stringify({ before, after });
	const review = boostingPricingChanges(before, after);
	expect(review.rules).toEqual([{ label: 'Dollar rate', before: '₦1,500', after: '₦2,000' }]);
	expect(review.offers[0].changes).toEqual([
		{ label: 'Price', before: '₦500 per 1,000', after: '₦950 per 1,000' },
		{ label: 'Price lock', before: 'Locked', after: 'Follows pricing rules' },
		{ label: 'Live', before: 'On', after: 'Off' }
	]);
	expect(review).toMatchObject({ goingLive: 0, goingOffline: 1, count: 4 });
	expect(JSON.stringify({ before, after })).toBe(snapshot);
});

it('does not truncate offers or omit simultaneous publishing and offline selections', () => {
	const before = structuredClone(sheet);
	before.rows = Array.from({ length: 15 }, (_, index) => ({
		...sheet.rows[0],
		id: String(index),
		selected: index === 0
	}));
	const after = structuredClone(before);
	for (const row of after.rows) row.selected = !row.selected;
	expect(boostingPricingChanges(before, after)).toMatchObject({
		goingLive: 14,
		goingOffline: 1,
		count: 15
	});
	expect(boostingPricingChanges(before, after).offers).toHaveLength(15);
});

it('includes overrides and fee edits even when no price or Live selection changes', () => {
	const after = structuredClone(sheet);
	after.settings.feePercent = 1.5;
	after.settings.feeFixed = 20;
	after.settings.feeConfirmed = true;
	after.rows[0].profitTargetNgn = 200;
	after.rows[0].hardProfitNgn = 100;
	after.rows[0].targetMarkup = 50;
	after.rows[0].useDefaultMarkup = true;
	const review = boostingPricingChanges(sheet, after);
	expect(review.rules).toHaveLength(3);
	expect(review.offers[0].changes.map((c) => c.label)).toEqual([
		'Use default profit percentage',
		'Profit on cost',
		'Profit target override',
		'Minimum retained profit override'
	]);
});

it('ignores metadata refreshes and equivalent legacy defaults', () => {
	const after = structuredClone(sheet);
	after.version++;
	after.rulesRevision = 'new';
	after.rows[0].sourceUpdatedAt = 'new';
	after.rows[0].useDefaultMarkup = false;
	after.settings.defaultMarkup = 40;
	after.settings.profitTargetNgn = 0;
	expect(boostingPricingChanges(sheet, after).count).toBe(0);
});

it('reviews all offer settings even when prices and Live ticks have not changed', () => {
	const next = structuredClone(sheet);
	next.rows[0] = {
		...next.rows[0],
		startingQuantity: 200,
		increment: 200,
		maximumQuantity: 10000,
		option: 'Everyday',
		shortPromise: 'A straightforward option.'
	};
	const changes = boostingPricingChanges(sheet, next);
	expect(changes.offers[0].changes.map((c) => c.label)).toEqual([
		'Customer minimum',
		'Quantity increment',
		'Customer maximum',
		'Option name',
		'Customer description'
	]);
	expect(changes.count).toBe(5);
});
