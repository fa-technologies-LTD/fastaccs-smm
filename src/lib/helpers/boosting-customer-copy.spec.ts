import { expect, it } from 'vitest';
import { boostCustomerCopy, boostCustomerOptionName } from './boosting-customer-copy';
const offer = {
	platform: 'instagram',
	outcome: 'followers',
	customerName: 'More stable',
	shortPromise: 'Less likely to drop, with stronger staying power.',
	expectationChips: ['Premium quality', '30-day refill protection'],
	refillDays: null
};
it('does not invent quality evidence or a tier label for a single option', () => {
	expect(boostCustomerCopy(offer)).toMatchObject({
		customerName: 'Instagram Followers',
		expectationChips: []
	});
	expect(boostCustomerCopy(offer).shortPromise).not.toMatch(/drop|quality|power/i);
	expect(boostCustomerOptionName(offer, 0, 1)).toBe('Instagram Followers');
});
it('distinguishes options with factual refill terms, not comparative quality', () => {
	expect(boostCustomerOptionName({ ...offer, refillDays: 30 }, 1, 2)).toBe(
		'Instagram Followers · 30-day refill'
	);
	expect(boostCustomerOptionName(offer, 0, 2)).toBe('Instagram Followers · No refill');
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

it.each(['Best', 'High-quality delivery.', 'More stable', 'Premium quality'])(
	'does not advertise %s as verified quality after manual review',
	(claim) => {
		const copy = boostCustomerCopy({ ...offer, customerName: claim, shortPromise: claim });
		expect(copy.customerName).toBe('Instagram Followers');
		expect(copy.shortPromise).toBe('Delivery timing varies. Track progress from your order.');
	}
);
