import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { NOT_HELD_FOR_IDENTITY_REVIEW, isHeldForIdentityReview } from './affiliate-review-hold';

describe('identity-review hold filter', () => {
	it('keeps rows that carry no flag at all (the 31 Aug bug dropped them)', () => {
		expect(NOT_HELD_FOR_IDENTITY_REVIEW.OR).toContainEqual({
			metadata: { path: ['suspectedSelfReferral'], equals: Prisma.AnyNull }
		});
	});

	it('still excludes rows flagged true', () => {
		expect(NOT_HELD_FOR_IDENTITY_REVIEW.OR).toContainEqual({
			NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } }
		});
	});

	it('treats only an explicit true as held', () => {
		expect(isHeldForIdentityReview({ suspectedSelfReferral: true })).toBe(true);
		expect(isHeldForIdentityReview({ suspectedSelfReferral: false })).toBe(false);
		expect(isHeldForIdentityReview({})).toBe(false);
		expect(isHeldForIdentityReview(null)).toBe(false);
	});
});
