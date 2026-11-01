import { expect, it } from 'vitest';
import {
	boostCustomerCopy,
	boostCustomerOption,
	boostTierLine,
	boostTierName
} from './boosting-customer-copy';
const offer = {
	platform: 'instagram',
	outcome: 'followers',
	qualityTier: 'premium',
	customerName: 'More stable',
	shortPromise: 'Less likely to drop, with stronger staying power.',
	expectationChips: ['Premium quality', '30-day refill protection'],
	refillDays: null
};
it('does not invent quality evidence or a tier label for a single option', () => {
	expect(boostCustomerCopy(offer)).toMatchObject({
		customerName: 'Instagram Followers',
		expectationChips: [],
		optionLabel: null
	});
	// Blank, so the service's own description shows instead.
	expect(boostCustomerCopy(offer).shortPromise).toBe('');
	expect(boostCustomerOption(offer, 1, 'Instagram Followers')).toEqual({
		name: 'Instagram Followers',
		line: ''
	});
});

it('names several options Quick, Stable and Most stable from the tier the owner set', () => {
	const name = (patch: object) =>
		boostCustomerOption({ ...offer, ...patch }, 2, 'Instagram Followers').name;
	expect(name({})).toBe('Most stable');
	expect(name({ qualityTier: 'stable' })).toBe('Stable');
	expect(name({ qualityTier: 'value' })).toBe('Quick');
	expect(name({ qualityTier: 'unknown' })).toBe('Quick');
	// A name or line the owner typed is what customers get.
	expect(name({ customerName: 'Nigeria option' })).toBe('Nigeria option');
	expect(
		boostCustomerOption({ ...offer, shortPromise: 'For Nigerian profiles.' }, 2, 'x').line
	).toBe('For Nigerian profiles.');
	expect(boostTierName('stable')).toBe('Stable');
	expect(boostTierLine('value', 'likes')).toBe(
		'Fast delivery at a lower price. Some may drop over time.'
	);
	expect(boostTierLine('stable', 'likes')).toBe(
		'Less likely to drop. A balance of price and staying power.'
	);
	expect(boostTierLine('premium', 'likes')).toBe('Our steadiest option. Less likely to drop.');
	expect(boostTierLine('value', 'followers')).toBe('Quick delivery, best when speed matters.');
	expect(boostTierLine('premium', 'followers')).toBe('Stable followers, less likely to drop.');
});

it('keeps neutral owner-written names and descriptions', () => {
	expect(
		boostCustomerCopy({
			...offer,
			customerName: 'Nigeria option',
			shortPromise: 'For Nigerian profiles.'
		})
	).toMatchObject({ customerName: 'Nigeria option', shortPromise: 'For Nigerian profiles.' });
});

it('names services consistently and replaces old stored names and lines', () => {
	const x = { ...offer, platform: 'x', outcome: 'likes', customerName: 'X (Twitter) Likes' };
	expect(boostCustomerCopy(x).customerName).toBe('X Likes');
	expect(
		boostCustomerCopy({
			...offer,
			platform: 'tiktok',
			outcome: 'live_likes',
			customerName: 'LIVE likes'
		}).customerName
	).toBe('TikTok LIVE Likes');
	expect(
		boostCustomerCopy({ ...offer, outcome: 'reach', customerName: 'Reach' }).customerName
	).toBe('Instagram Reach');
	expect(
		boostCustomerCopy({ ...offer, outcome: 'comments', shortPromise: 'Positive Comments' })
			.shortPromise
	).toBe('Positive comments from a mix of accounts.');
	expect(
		boostCustomerCopy({ ...offer, shortPromise: 'A lower-cost option for straightforward growth.' })
			.shortPromise
	).toBe('');
	expect(boostCustomerCopy({ ...offer, refillDays: 30 }).optionLabel).toBe('30-day refill');
});

it.each(['Best', 'High-quality delivery.', 'More stable', 'Premium quality'])(
	'does not advertise %s as verified quality after manual review',
	(claim) => {
		const copy = boostCustomerCopy({ ...offer, customerName: claim, shortPromise: claim });
		expect(copy.customerName).toBe('Instagram Followers');
		expect(copy.shortPromise).toBe('');
	}
);
