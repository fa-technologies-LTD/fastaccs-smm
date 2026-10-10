import { expect, it } from 'vitest';
import approved from './approved-pricing-seed.json';
import { applyPricingOwnerAdjustments } from './pricing-owner-adjustments';
import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';

it('moves s5375 to the separate YouTube Custom Comments offer without altering the sealed approval', () => {
	const source = approved.sheet as BoostPricingSheet;
	const before = JSON.stringify(source);
	const next = applyPricingOwnerAdjustments(source);
	const ordinary = next.rows.find((r) => r.id === '0ad3ae83-2991-46f5-b63d-ba54bff48f7b')!;
	const custom = next.rows.find((r) => r.id === 'cc0fbcd3-1e08-4d78-b2e6-e46562217e85')!;
	expect(ordinary.selected).toBe(false);
	expect(ordinary.outcome).toBe('comments');
	expect(custom).toMatchObject({
		selected: true,
		outcome: 'custom_comments',
		provider: 'smm_raja',
		serviceId: 's5375',
		sale: 750,
		units: 100,
		option: ''
	});
	expect(custom.sourceOfferId).not.toBe(ordinary.sourceOfferId);
	expect(next.rows.filter((r) => r.selected)).toHaveLength(40);
	expect(JSON.stringify(source)).toBe(before);
	expect(applyPricingOwnerAdjustments(next)).toEqual(next);
});
