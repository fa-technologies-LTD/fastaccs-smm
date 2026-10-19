import { expect, it } from 'vitest';
import {
	boostBenefitLabel,
	boostLowerPriceOffer,
	boostQuantityText
} from './boosting-customer-facts';
import { boostCustomerShortName } from './boosting-customer-copy';

const priced = (id: string, price: number, step = 1000) => ({
	id,
	platform: 'x',
	outcome: 'followers',
	minQuantity: step,
	maxQuantity: 100000,
	stepQuantity: step,
	pricePerStepNgn: price
});
it('compares actual same-quantity totals instead of different pack prices and never mutates them', () => {
	const offers = [priced('expensive', 150, 100), priced('lower', 1200)];
	const before = JSON.stringify(offers);
	expect(boostLowerPriceOffer(offers)).toBe('lower');
	expect(JSON.stringify(offers)).toBe(before);
});
it('does not claim lower prices for rounded ties, incompatible grids, different outcomes or different audiences', () => {
	expect(boostLowerPriceOffer([priced('a', 501), priced('b', 502)])).toBeNull();
	expect(
		boostLowerPriceOffer([
			{ ...priced('a', 500), minQuantity: 50, stepQuantity: 100 },
			priced('b', 1000)
		])
	).toBeNull();
	expect(
		boostLowerPriceOffer([priced('a', 500), { ...priced('b', 1000), outcome: 'likes' }])
	).toBeNull();
	expect(
		boostLowerPriceOffer([
			priced('a', 500),
			{ ...priced('b', 1000), benefitLabel: 'Nigeria audience' }
		])
	).toBeNull();
	expect(boostLowerPriceOffer([priced('a', 500)])).toBeNull();
});
it('only takes refill terms from a valid structured purchase fact', () => {
	expect(boostBenefitLabel({ refillDays: 30 })).toBe('30-day refill');
	for (const refillDays of [null, 0, -1, 1.5, '30', NaN, Infinity])
		expect(boostBenefitLabel({ refillDays, customerName: 'Guaranteed refill' })).toBeNull();
});
it('requires an approved matching audience on the selected routes, not a country word in a name', () => {
	const offer = {
		audienceTag: 'nigeria',
		routingPolicy: 'locked',
		lockedRouteId: 'chosen',
		routes: [
			{ id: 'chosen', state: 'enabled', equivalenceApproved: true, audienceTags: ['nigeria'] }
		]
	};
	expect(boostBenefitLabel(offer)).toBe('Nigeria audience');
	expect(boostBenefitLabel({ ...offer, lockedRouteId: 'other' })).toBeNull();
	expect(
		boostBenefitLabel({ ...offer, routes: [{ ...offer.routes[0], equivalenceApproved: false }] })
	).toBeNull();
	expect(boostBenefitLabel({ ...offer, audienceTag: 'unverified-country' })).toBeNull();
	expect(boostBenefitLabel({ customerName: 'Nigeria followers' })).toBeNull();
});
it.each([
	[500, 'followers', '500 followers'],
	[1, 'followers', '1 follower'],
	[10, 'custom_comments', '10 comments'],
	[200, 'live_likes', '200 live likes'],
	[1000, 'streams', '1,000 streams'],
	[20, 'watch_time', '20 watch-time units'],
	[500, 'unknown', '500 units']
])('uses a contextual unit for %s %s', (quantity, outcome, expected) => {
	expect(boostQuantityText(Number(quantity), String(outcome))).toBe(expected);
});
it('does not bring generated numbers or repeated platform names back into choices', () => {
	const offer = {
		platform: 'x',
		outcome: 'followers',
		customerName: 'X (Twitter) Followers · Standard option 2',
		shortPromise: '',
		expectationChips: [],
		refillDays: null
	};
	expect(boostCustomerShortName(offer)).toBeNull();
	expect(boostCustomerShortName({ ...offer, customerName: 'Lower price' })).toBeNull();
	expect(boostCustomerShortName({ ...offer, customerName: 'Standard option 2' })).toBeNull();
	expect(boostCustomerShortName({ ...offer, customerName: 'X Followers' })).toBeNull();
	expect(boostCustomerShortName({ ...offer, customerName: 'Random positive comments' })).toBe(
		'Random positive comments'
	);
});
