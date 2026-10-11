import { expect, it } from 'vitest';
import { sheet, row, quote } from './boosting-pricing-sheet-fixtures';
import {
	boostAutoPrice,
	boostControlSignature,
	boostEffectiveRules,
	mergeBoostCostRefresh,
	type BoostControlsView,
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

it('ignores automatic-only rules for locked prices, but never ignores cost or safety changes', () => {
	const original = boostEffectiveRules(row, sheet);
	expect(
		boostEffectiveRules(row, {
			...sheet,
			settings: {
				...sheet.settings,
				defaultMarkup: 500,
				profitTargetNgn: 1000,
				maxPriceMultiple: 2
			}
		})
	).toBe(original);
	for (const overrides of [
		{ fx: 2000 },
		{ hardProfitNgn: 100 },
		{ feeConfirmed: true, feePercent: 5 }
	])
		expect(
			boostEffectiveRules(row, { ...sheet, settings: { ...sheet.settings, ...overrides } })
		).not.toBe(original);
});
it('ignores global markup for an automatic offer with its own markup', () => {
	const automatic = { ...row, priceMode: 'target' as const, useDefaultMarkup: false };
	expect(boostEffectiveRules(automatic, sheet)).toBe(
		boostEffectiveRules(automatic, {
			...sheet,
			settings: { ...sheet.settings, defaultMarkup: 500 }
		})
	);
});
function refreshed(): BoostControlsView {
	return {
		sheet: structuredClone(sheet),
		quotes: { row: { ...quote, rateUsd: 0.08 } },
		liveStatuses: { row: 'live' },
		setup: {},
		archivedDraft: false,
		history: [],
		approval: { id: 'a', approvedAt: '', digest: '' }
	};
}
it('refreshes costs while preserving every pending price, lock, rule and visibility edit', () => {
	const draft = structuredClone(sheet);
	draft.settings.fx = 2000;
	draft.rows[0].sale = 900;
	draft.rows[0].selected = false;
	draft.rows[0].profitTargetNgn = 100;
	const fresh = refreshed();
	const merged = mergeBoostCostRefresh(sheet, draft, fresh);
	expect(merged.sheet).toEqual(draft);
	expect(merged.quotes.row?.rateUsd).toBe(0.08);
	merged.sheet.rows[0].sale = 1000;
	expect(draft.rows[0].sale).toBe(900);
	expect(fresh.sheet.rows[0].sale).toBe(500);
});
it('does not silently rebase pending edits over concurrent settings or supplier changes', () => {
	for (const change of ['version', 'rules', 'source', 'price', 'code', 'rows']) {
		const fresh = refreshed();
		if (change === 'version') fresh.sheet.version++;
		if (change === 'rules') fresh.sheet.settings.fx = 2000;
		if (change === 'source') fresh.sheet.rows[0].sourceUpdatedAt = 'changed';
		if (change === 'price') fresh.sheet.rows[0].sale = 700;
		if (change === 'code') fresh.sheet.rows[0].serviceId = 'new';
		if (change === 'rows') fresh.sheet.rows = [];
		expect(() => mergeBoostCostRefresh(sheet, sheet, fresh)).toThrow('Your edits are kept');
	}
});
