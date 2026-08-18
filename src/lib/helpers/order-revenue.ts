export const REVENUE_ORDER_STATUSES = ['paid', 'completed'] as const;
const REVENUE_STATUS_SET = new Set<string>(REVENUE_ORDER_STATUSES);

/**
 * The marker any refund path writes onto an order. A refund can land on `status`
 * (full refund), `paymentStatus` (full + per-account refunds), or `deliveryStatus`
 * (the Numbers auto-refund, plus legacy phone orders whose payment fields were never
 * flipped). Money that went back to the customer is not revenue on ANY of them.
 */
export const REFUNDED_MARKER = 'refunded';

function normalize(value: string | null | undefined): string {
	return String(value || '')
		.trim()
		.toLowerCase();
}

/**
 * True when an order represents money we actually kept.
 *
 * Refunds are checked FIRST and win outright. Without that, a refunded order whose
 * `status` was left/put back at 'completed' still counted as revenue — which is how a
 * fully refunded ₦9,500 order kept reporting as a paid sale, and how the same customer
 * read as "1 paid" while their money sat in store credit. The three refund fields are
 * checked independently because different refund paths write different ones.
 *
 * NOTE: a PARTIAL (per-account) refund deliberately still counts. Those orders keep
 * `paymentStatus: 'paid'` and only flip once the last good account is refunded, so the
 * remaining value stays revenue. The partial's refunded portion is not netted off here —
 * that is a separate, pre-existing accounting gap, not something this predicate decides.
 */
export function isRevenueOrder(input: {
	status?: string | null;
	paymentStatus?: string | null;
	deliveryStatus?: string | null;
}): boolean {
	const status = normalize(input.status);
	const paymentStatus = normalize(input.paymentStatus);
	const deliveryStatus = normalize(input.deliveryStatus);
	if (
		status === REFUNDED_MARKER ||
		paymentStatus === REFUNDED_MARKER ||
		deliveryStatus === REFUNDED_MARKER
	) {
		return false;
	}
	return REVENUE_STATUS_SET.has(status) || paymentStatus === 'paid';
}
