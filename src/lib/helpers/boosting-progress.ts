import { isOrderPaymentConfirmed } from './buyer-order-visibility';
import { isBoostOrderOverdue } from './boosting-overdue-review';

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

/** Display only: never let a legacy order-summary Done flag hide unfinished delivery. */
export function getBoostOrderSummaryStatus(orderValue: unknown): string | null {
	const order = record(orderValue);
	const items = Array.isArray(order.orderItems) ? order.orderItems : [];
	const boosts = items.filter((item) => Boolean(record(item).boostTargetUrl));
	if (!boosts.length) return null;
	if ([order.status, order.paymentStatus, order.deliveryStatus].includes('refunded'))
		return 'refunded';
	if (order.status === 'cancelled') return 'cancelled';
	if (!isOrderPaymentConfirmed({ status: order.status, paymentStatus: order.paymentStatus }))
		return 'pending';
	const states = boosts.map((item) => {
		const progress = record(record(item).boostProgress);
		return typeof progress.status === 'string'
			? progress.status
			: getBoostingProgress(item, order)?.status;
	});
	if (states.includes('needs_link')) return 'needs_link';
	if (
		states.some((state) =>
			['under_review', 'manual_review', 'partial', 'rejected'].includes(state ?? '')
		)
	)
		return 'under_review';
	if (states.every((state) => state === 'completed'))
		return boosts.length === items.length ? 'completed' : 'processing';
	if (states.every((state) => state === 'cancelled')) return 'cancelled';
	if (states.every((state) => state === 'refunded')) return 'refunded';
	return 'processing';
}

/** Buyer-facing delivery state, not payment state or a guarantee of visible engagement. */
export function getBoostingProgress(
	itemValue: unknown,
	orderValue: unknown,
	now = new Date()
): BoostingProgress | null {
	const item = record(itemValue);
	if (!item.boostTargetUrl) return null;
	const order = record(orderValue);
	const fulfillment = record(item.boostFulfillment);
	let status = String(item.boostFulfillmentStatus || 'pending');
	if (fulfillment.status === 'manual_review' || fulfillment.status === 'submission_unknown') {
		status = fulfillment.lastSafeErrorCategory === 'provider_partial' ? 'partial' : 'under_review';
	}
	if (
		item.boostFulfillmentStatus === 'needs_link' &&
		fulfillment.lastSafeErrorCategory === 'admin_link_requested'
	)
		status = 'needs_link';
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
	const overdue = isBoostOrderOverdue(
		{
			boostFulfillmentStatus: status,
			order: {
				paymentStatus: typeof order.paymentStatus === 'string' ? order.paymentStatus : '',
				status: typeof order.status === 'string' ? order.status : '',
				deliveryStatus: typeof order.deliveryStatus === 'string' ? order.deliveryStatus : '',
				paidAt:
					order.paidAt instanceof Date || typeof order.paidAt === 'string' ? order.paidAt : null,
				createdAt:
					order.createdAt instanceof Date || typeof order.createdAt === 'string'
						? order.createdAt
						: null
			}
		},
		now
	);
	const message =
		overdue && ['pending', 'queued', 'in_progress'].includes(status)
			? 'Delivery is taking longer. Contact support for an update; no need to reorder.'
			: fulfillment.lastSafeErrorCategory === 'status_check_failed' &&
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
