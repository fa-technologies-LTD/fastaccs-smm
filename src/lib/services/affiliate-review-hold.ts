import { Prisma } from '@prisma/client';

/**
 * Ledger rows NOT held for identity review.
 *
 * The flag is only written when a reward looks suspicious. `NOT { path equals true }` on its own
 * also drops every row that has no flag at all (SQL NULL), which silently stopped every
 * affiliate reward from clearing from 31 Aug 2026. Use this filter instead, inside `AND: [...]`.
 */
export const NOT_HELD_FOR_IDENTITY_REVIEW: Prisma.WalletTransactionWhereInput = {
	OR: [
		{ metadata: { path: ['suspectedSelfReferral'], equals: Prisma.AnyNull } },
		{ NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } } }
	]
};

export function isHeldForIdentityReview(metadata: unknown): boolean {
	return Boolean(
		metadata &&
			typeof metadata === 'object' &&
			!Array.isArray(metadata) &&
			(metadata as Record<string, unknown>).suspectedSelfReferral === true
	);
}
