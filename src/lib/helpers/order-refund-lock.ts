import { REFUNDED_MARKER } from './order-revenue';

/**
 * The order columns that carry refund state. A refunded order must stay refunded, so the admin
 * order-update endpoint may never move any of them off 'refunded'.
 *
 * Three production orders were silently un-refunded this way: a per-account refund set
 * status + paymentStatus to 'refunded', then a PATCH seconds later put status back to
 * 'completed', leaving a fully refunded sale still reporting as revenue. Worse, PATCHing
 * paymentStatus back to 'paid' re-opens both refund endpoints' "already refunded" guards and
 * would allow a SECOND refund of money already returned.
 */
export const ORDER_STATE_FIELDS = ['status', 'paymentStatus', 'deliveryStatus'] as const;

/**
 * True when a patch would move a refunded order's state — i.e. reverse a refund.
 * Pure, so the rule is unit-tested without a database. Only the three state columns are frozen;
 * editing contact details or a payment reference on a refunded order stays allowed, so this
 * never blocks legitimate admin bookkeeping.
 */
export function isRefundReversal(
	current: {
		status?: string | null;
		paymentStatus?: string | null;
		deliveryStatus?: string | null;
	},
	updateData: object
): boolean {
	const isRefunded = ORDER_STATE_FIELDS.some(
		(field) => String(current[field] || '').toLowerCase() === REFUNDED_MARKER
	);
	if (!isRefunded) return false;
	return ORDER_STATE_FIELDS.some((field) => field in updateData);
}
