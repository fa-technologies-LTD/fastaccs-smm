import { isOrderPaymentConfirmed } from './buyer-order-visibility';

export interface BoostingProgress {
	status: string;
	label: string;
	message: string;
	reportedDelivered: number | null;
	quantity: number;
	lastCheckedAt: string | null;
	nextCheckAt: string | null;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
function date(value: unknown): string | null {
	if (!(value instanceof Date) && typeof value !== 'string') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Buyer-facing delivery state, not payment state or a guarantee of visible engagement. */
export function getBoostingProgress(
	itemValue: unknown,
	orderValue: unknown
): BoostingProgress | null {
	const item = record(itemValue);
	if (!item.boostTargetUrl) return null;
	const order = record(orderValue);
	const fulfillment = record(item.boostFulfillment);
	let status = String(item.boostFulfillmentStatus || 'pending');
	if (fulfillment.status === 'manual_review' || fulfillment.status === 'submission_unknown') {
		status = fulfillment.lastSafeErrorCategory === 'provider_partial' ? 'partial' : 'under_review';
	}
	if (order.status === 'cancelled') status = 'cancelled';
	if (
		order.paymentStatus === 'refunded' ||
		order.status === 'refunded' ||
		order.deliveryStatus === 'refunded'
	)
		status = 'refunded';
	const quantities = Number(item.boostQuantity ?? fulfillment.quantity);
	const quantity = Number.isSafeInteger(quantities) && quantities > 0 ? quantities : 0;
	const remains = fulfillment.remains;
	const reportedDelivered =
		typeof remains === 'number' && Number.isSafeInteger(remains) && remains >= 0 && quantity > 0
			? Math.max(0, Math.min(quantity, quantity - remains))
			: null;
	const labels: Record<string, [string, string]> = {
		pending: ['Queued', 'Your boost is queued. No need to order again.'],
		queued: ['Queued', 'Your boost is queued. No need to order again.'],
		in_progress: ['In progress', 'Your boost has started. Progress updates here automatically.'],
		completed: [
			'Completed',
			'Delivery is marked complete. Report an issue if anything is missing.'
		],
		partial: ['Partially delivered', 'We’re reviewing the remaining amount. No need to reorder.'],
		under_review: ['Under review', 'We’re checking this boost. No action needed from you.'],
		manual_review: ['Under review', 'We’re checking this boost. No action needed from you.'],
		needs_link: ['Update link', 'Check and update your link below.'],
		rejected: ['Needs support', 'Contact support about this boost.'],
		cancelled: ['Cancelled', 'This boost is stopped. Check your payment or refund status above.'],
		refunded: ['Refunded', 'Check your refund details above.']
	};
	if (
		!isOrderPaymentConfirmed({ status: order.status, paymentStatus: order.paymentStatus }) &&
		!['cancelled', 'refunded'].includes(status)
	)
		status = 'not_started';
	const [label, originalMessage] = labels[status] ?? [
		'Not started',
		'Delivery starts after payment is confirmed.'
	];
	const message =
		fulfillment.lastSafeErrorCategory === 'status_check_failed' &&
		['pending', 'queued', 'in_progress'].includes(status)
			? 'The latest update is delayed. Your order has not been restarted.'
			: originalMessage;
	return {
		status,
		label,
		message,
		quantity,
		reportedDelivered: ['pending', 'queued', 'in_progress', 'partial'].includes(status)
			? reportedDelivered
			: null,
		lastCheckedAt: date(fulfillment.lastCheckedAt),
		nextCheckAt: date(fulfillment.nextActionAt)
	};
}
