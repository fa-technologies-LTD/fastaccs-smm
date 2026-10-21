/** Super rewards clear after 24 elapsed hours, not on the next calendar day. */
export const SUPER_REWARD_VESTING_HOURS = 24;
export const SUPER_REWARD_VESTING_POLICY = 'super-24h-v1';

function date(value: unknown): Date | null {
	if (!(value instanceof Date) && typeof value !== 'string') return null;
	const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function isSuperAffiliateReward(row: {
	metadata?: unknown;
	reference?: string | null;
}): boolean {
	const kind = record(row.metadata).kind;
	return (
		['super_activation', 'super_monthly_bonus', 'super_order_commission'].includes(String(kind)) ||
		/^super:(?:activation:|monthly_bonus:|commission:order:)/.test(row.reference ?? '')
	);
}

export function computeSuperRewardVestsAt(from: Date = new Date()): Date {
	if (!Number.isFinite(from.getTime())) throw new Error('Invalid Super reward earning time.');
	return new Date(from.getTime() + SUPER_REWARD_VESTING_HOURS * 60 * 60 * 1000);
}

/**
 * Honour the original earning time of pending Super rewards, including legacy 14-day rows.
 * Never infer the programme from today's user flag: an old regular contract stays regular.
 * Commission callers supply the original paid-at time, not a later cost-review/transfer time.
 * Explicit review clearance may delay availability but never starts another 24-hour wait.
 */
export function getAffiliateRewardVestsAt(row: {
	metadata?: unknown;
	reference?: string | null;
	createdAt?: Date | string;
	commissionEarnedAt?: Date | string | null;
}): Date | null {
	const metadata = record(row.metadata);
	const saved = date(metadata.vestsAt);
	if (!isSuperAffiliateReward(row)) return saved;
	const earned = date(row.commissionEarnedAt) ?? date(metadata.earnedAt) ?? date(row.createdAt);
	// An incomplete legacy record must not become immediately spendable by accident.
	if (!earned) return saved;
	const due = computeSuperRewardVestsAt(earned);
	const costResolved = date(metadata.costResolvedAt);
	return costResolved && costResolved > due ? costResolved : due;
}
