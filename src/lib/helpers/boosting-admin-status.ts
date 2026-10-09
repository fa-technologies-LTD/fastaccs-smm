export const BOOST_ITEM_STATUSES = [
	'pending',
	'needs_link',
	'in_progress',
	'under_review',
	'partial',
	'completed',
	'rejected',
	'cancelled'
] as const;
export type BoostItemStatus = (typeof BOOST_ITEM_STATUSES)[number];
export const BOOST_ACTIVE_ITEM_STATUSES = [
	'pending',
	'needs_link',
	'in_progress',
	'under_review',
	'partial',
	'rejected',
	'cancelled'
] as const;
export const BOOST_OPEN_COMPLAINT_STATUSES = [
	'open',
	'validated',
	'escalating',
	'escalated',
	'escalation_unknown'
] as const;

/** Unknown non-empty states need investigation; do not describe them as a fresh order. */
export function normalizeBoostItemStatus(value: string | null | undefined): BoostItemStatus {
	if (!value) return 'pending';
	return BOOST_ITEM_STATUSES.includes(value as BoostItemStatus)
		? (value as BoostItemStatus)
		: 'under_review';
}

/** Read-only UI hint. The mutation endpoint rechecks the actual state under locks. */
export function canManuallyChangeBoostStatus(
	state: { status: string; mode: string } | null
): boolean {
	return (
		!state ||
		(['manual', 'shadow'].includes(state.mode) &&
			!['submitted', 'in_progress'].includes(state.status))
	);
}
