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

/** Payment states that mean money arrived for the order, or is being held for review. */
export const MONEY_IN_PAYMENT_STATUSES = new Set(['paid', 'success', 'overpaid', 'under_review']);
const CLOSING_ORDER_STATUSES = new Set(['cancelled', 'canceled', 'failed', 'expired', 'abandoned']);
const PAYMENT_FIELDS = ['paymentStatus', 'paymentReference', 'paymentChannel', 'paidAt'] as const;

/**
 * Why an admin order edit may not go ahead, or null when it may. Money only moves through verified
 * payments and refunds:
 * - 'refund_required': closing a paid order. It must go through Cancel and refund, never a bare cancel
 *   (two paid X orders and a held ₦10,500 payment were closed this way with nothing returned).
 * - 'payment_locked': marking an order paid by hand, or changing the payment details of a paid order.
 *   Either would let a refund pay out money that never arrived.
 */
export function paidOrderEditBlock(
	current: { paymentStatus?: string | null },
	updateData: Record<string, unknown>
): 'refund_required' | 'payment_locked' | null {
	const nextPayment = updateData.paymentStatus;
	if (typeof nextPayment === 'string' && MONEY_IN_PAYMENT_STATUSES.has(nextPayment.toLowerCase()))
		return 'payment_locked';
	if (!MONEY_IN_PAYMENT_STATUSES.has(String(current.paymentStatus || '').toLowerCase()))
		return null;
	if (PAYMENT_FIELDS.some((field) => field in updateData)) return 'payment_locked';
	const nextStatus = updateData.status;
	if (typeof nextStatus === 'string' && CLOSING_ORDER_STATUSES.has(nextStatus.toLowerCase()))
		return 'refund_required';
	return null;
}
