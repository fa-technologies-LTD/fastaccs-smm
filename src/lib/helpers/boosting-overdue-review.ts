export const BOOST_REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;
export const BOOST_REVIEW_OPEN_STATUSES = [
	'pending',
	'in_progress',
	'needs_link',
	'under_review',
	'partial'
];

/** A support deadline, never evidence of supplier failure or permission to resubmit. */
export function isBoostOrderOverdue(
	item: {
		boostFulfillmentStatus?: string | null;
		order: {
			paymentStatus?: string;
			status?: string;
			deliveryStatus?: string;
			paidAt?: Date | string | null;
			createdAt?: Date | string | null;
		};
	},
	now = new Date()
): boolean {
	const o = item.order;
	if (!o) return false;
	if (!['paid', 'success', 'overpaid'].includes(o.paymentStatus ?? '')) return false;
	if (['refunded', 'cancelled'].includes(o.status ?? '') || o.deliveryStatus === 'refunded')
		return false;
	if (['completed', 'rejected', 'cancelled'].includes(item.boostFulfillmentStatus ?? ''))
		return false;
	const started = new Date(o.paidAt ?? o.createdAt ?? '').getTime();
	return Number.isFinite(started) && now.getTime() - started >= BOOST_REVIEW_AFTER_MS;
}
