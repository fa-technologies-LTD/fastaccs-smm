import { expect, it } from 'vitest';
import approved from './approved-pricing-seed.json';
import { applyPricingOwnerAdjustments } from './pricing-owner-adjustments';
import type { BoostPricingSheet } from '$lib/helpers/boosting-pricing-sheet';
import {
	pricingEconomics,
	pricingTarget,
	pricingWarnings
} from '$lib/helpers/boosting-pricing-sheet';

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
	expect(next.rows.filter((r) => r.selected)).toHaveLength(41);
	expect(JSON.stringify(source)).toBe(before);
	expect(applyPricingOwnerAdjustments(next)).toEqual(next);
});

it('keeps the cheapest compatible Threads Likes route and lowers only its selling price', () => {
	const source = approved.sheet as BoostPricingSheet;
	const next = applyPricingOwnerAdjustments(source);
	const likes = next.rows.find(
		(r) => r.platform === 'threads' && r.outcome === 'likes' && r.selected
	)!;
	const quote = {
		providerServiceId: 'likes',
		name: 'Threads Likes',
		rateUsd: 2.6,
		min: 10,
		max: 65000000,
		checkedAt: new Date().toISOString(),
		issues: []
	};
	expect(likes).toMatchObject({
		provider: 'bulk_follows',
		serviceId: '14940',
		units: 1000,
		sale: 5100,
		targetMarkup: 30,
		option: ''
	});
	expect(pricingEconomics(likes, next, quote).cost).toBe(3900);
	expect(pricingEconomics(likes, next, quote).profit).toBe(1200);
	expect(pricingTarget(likes, next, quote)).toBe(likes.sale);
	// The remaining catalogue-price mismatch must stay visible, not disappear by changing packs.
	expect(pricingWarnings(likes, next, quote)).toContain('Costs more per item than followers.');
});

it('adds an explicitly refill-advertised Threads Followers route without changing the approved entry route', () => {
	const source = approved.sheet as BoostPricingSheet;
	const next = applyPricingOwnerAdjustments(source);
	const followers = next.rows.filter(
		(r) => r.platform === 'threads' && r.outcome === 'followers' && r.selected
	);
	expect(followers).toHaveLength(2);
	const original = source.rows.find((r) => r.id === followers[0].id)!;
	expect(followers[0]).toEqual({ ...original, option: 'Affordable' });
	expect(followers[1]).toMatchObject({
		provider: 'bulk_follows',
		serviceId: '8023',
		units: 1000,
		sale: 18300,
		targetMarkup: 30,
		startingQuantity: 1000,
		increment: 100,
		recoveryMode: 'off',
		attempts: 1,
		option: 'Refill option',
		tier: 'stable',
		sourceOfferId: '29d5571a-8e3c-4008-a0b8-1ceabec096a5'
	});
	const quote = {
		providerServiceId: 'refill',
		name: 'Threads Followers REFILL 30D',
		rateUsd: 9.36,
		min: 10,
		max: 100000,
		checkedAt: new Date().toISOString(),
		issues: []
	};
	expect(pricingEconomics(followers[1], next, quote).cost).toBe(14040);
	expect(pricingEconomics(followers[1], next, quote).profit).toBe(4260);
	expect(pricingTarget(followers[1], next, quote)).toBe(followers[1].sale);
	expect(pricingWarnings(followers[1], next, quote)).toEqual([]);
	expect(followers[1].note).toContain('Delivery and refill not tested');
});

it('preserves every other platform and unrelated Threads choice and never overwrites a saved draft', () => {
	const source = approved.sheet as BoostPricingSheet;
	const next = applyPricingOwnerAdjustments(source);
	const changedIds = new Set([
		'0ad3ae83-2991-46f5-b63d-ba54bff48f7b',
		'cc0fbcd3-1e08-4d78-b2e6-e46562217e85',
		'59e8a17b-123b-459f-a6fc-3da9064d0b65',
		'42b4261c-6cde-4c6e-8f4d-3d7691a2431e',
		'29d5571a-8e3c-4008-a0b8-1ceabec096a5'
	]);
	expect(next.rows.filter((r) => !changedIds.has(r.id))).toEqual(
		source.rows.filter((r) => !changedIds.has(r.id))
	);
	expect(applyPricingOwnerAdjustments(next)).toEqual(next);
	const saved = structuredClone(next);
	saved.version = 1;
	saved.rows.find((r) => r.id === '59e8a17b-123b-459f-a6fc-3da9064d0b65')!.sale = 5500;
	expect(applyPricingOwnerAdjustments(saved)).toEqual(saved);
});
