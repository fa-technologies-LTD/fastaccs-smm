import { isOrderPaymentConfirmed } from './buyer-order-visibility';
import { getBoostingProgress, getBoostOrderSummaryStatus } from './boosting-progress';

/**
 * One customer-facing stage per order, the same for accounts, numbers and engagement:
 *
 *   Awaiting payment → Preparing → In progress → Delivered
 *   with Refunded / Part refunded, Payment expired and Cancelled as endings, and two side tracks:
 *   Needs you (we're waiting on the buyer) and Checking (we're reviewing it; never shown as cancelled).
 *
 * It only reads today's fields, so every screen (order list, order page, emails) can use it without
 * any data change. Refunds made on the site always go to store credit. Engagement delivery is taken
 * from the supplier's report for now; when FastAccs checks the profile itself, a verified line can
 * say so (`deliveryCheck: 'verified'`).
 */
export type OrderStageKey =
	| 'awaiting_payment'
	| 'confirming_payment'
	| 'payment_expired'
	| 'cancelled'
	| 'preparing'
	| 'in_progress'
	| 'checking'
	| 'needs_you'
	| 'delivered'
	| 'part_refunded'
	| 'refunded';

export type OrderStageTone = 'pay' | 'prep' | 'progress' | 'done' | 'refund' | 'stop' | 'you';

export interface OrderStage {
	key: OrderStageKey;
	/** Short chip text. */
	chip: string;
	tone: OrderStageTone;
	/** One plain sentence: what is happening, or what the buyer can do. */
	detail: string;
	/** Engagement delivery, 0–100, when the supplier reports it. */
	progress: number | null;
	/** Who confirmed an engagement delivery: the supplier's report, or our own profile check. */
	deliveryCheck: 'supplier' | 'verified' | null;
}

type OrderType = 'account' | 'phone' | 'boosting';
type Row = Record<string, unknown>;

const lower = (value: unknown) =>
	String(value ?? '')
		.trim()
		.toLowerCase();
const money = (value: unknown) => {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
};
const naira = (value: number) =>
	`₦${(Math.round(value * 100) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

function itemsOf(order: Row): Row[] {
	const items = Array.isArray(order.orderItems)
		? order.orderItems
		: Array.isArray(order.items)
			? order.items
			: [];
	return items.filter((item): item is Row => Boolean(item) && typeof item === 'object');
}

function orderTypeOf(order: Row, items: Row[]): OrderType {
	const type = lower(order.orderType);
	if (type === 'phone' || type === 'boosting') return type;
	if (items.some((item) => Boolean(item.boostTargetUrl))) return 'boosting';
	return 'account';
}

const stage = (
	key: OrderStageKey,
	chip: string,
	tone: OrderStageTone,
	detail: string,
	extra: Partial<Pick<OrderStage, 'progress' | 'deliveryCheck'>> = {}
): OrderStage => ({ key, chip, tone, detail, progress: null, deliveryCheck: null, ...extra });

/** Delivered / ordered across engagement lines, when the supplier has reported numbers. */
function engagementProgress(order: Row, items: Row[]): { delivered: number; total: number } | null {
	let delivered = 0;
	let total = 0;
	let reported = false;
	for (const item of items.filter((row) => Boolean(row.boostTargetUrl))) {
		const progress =
			(item.boostProgress as
				| { reportedDelivered?: number | null; quantity?: number }
				| undefined) ?? getBoostingProgress(item, order);
		const quantity = Number(progress?.quantity ?? item.boostQuantity ?? 0);
		if (!Number.isFinite(quantity) || quantity <= 0) continue;
		total += quantity;
		const done = progress?.reportedDelivered;
		if (typeof done === 'number' && Number.isFinite(done)) {
			reported = true;
			delivered += Math.max(0, Math.min(quantity, done));
		}
	}
	return reported && total > 0 ? { delivered, total } : null;
}

export function getOrderStage(orderValue: unknown, now: Date = new Date()): OrderStage {
	const order = (orderValue && typeof orderValue === 'object' ? orderValue : {}) as Row;
	const items = itemsOf(order);
	const type = orderTypeOf(order, items);
	const status = lower(order.status);
	const payment = lower(order.paymentStatus);
	const delivery = lower(order.deliveryStatus);
	const paid = money(order.totalAmount);
	const refunded = money(order.refundedAmount);

	// Endings with money returned. Site refunds always go to store credit.
	const fullyRefunded =
		status === 'refunded' ||
		payment === 'refunded' ||
		delivery === 'refunded' ||
		(paid > 0 && refunded >= paid);
	if (fullyRefunded) {
		const amount = refunded > 0 ? refunded : paid;
		const back = `${naira(amount)} is back in your store credit.`;
		if (type === 'phone') return stage('refunded', 'Refunded', 'refund', `No code came. ${back}`);
		if (type === 'boosting')
			return stage('refunded', 'Refunded', 'refund', `We couldn't deliver this. ${back}`);
		return stage('refunded', 'Refunded', 'refund', back);
	}

	const confirmed = isOrderPaymentConfirmed({ status, paymentStatus: payment });
	if (!confirmed) {
		if (['expired', 'abandoned'].includes(status) || ['expired', 'abandoned'].includes(payment))
			return stage(
				'payment_expired',
				'Payment expired',
				'stop',
				'Nothing was charged. Order again anytime.'
			);
		if (
			['cancelled', 'failed'].includes(status) ||
			['cancelled', 'canceled', 'user_cancelled', 'failed', 'rejected', 'reversed'].includes(
				payment
			)
		)
			return stage(
				'cancelled',
				'Cancelled',
				'stop',
				'The payment didn’t go through. Nothing was charged.'
			);
		const expiresAt = order.paymentExpiresAt;
		if (
			(expiresAt instanceof Date || typeof expiresAt === 'string') &&
			new Date(expiresAt).getTime() < now.getTime() &&
			payment !== 'processing'
		)
			return stage(
				'payment_expired',
				'Payment expired',
				'stop',
				'Nothing was charged. Order again anytime.'
			);
		if (payment === 'processing' || payment === 'under_review')
			return stage(
				'confirming_payment',
				'Confirming payment',
				'pay',
				'We’re confirming your payment. This page updates by itself.'
			);
		return stage(
			'awaiting_payment',
			'Awaiting payment',
			'pay',
			'Finish paying to start this order.'
		);
	}

	const partRefund = refunded > 0 ? ` ${naira(refunded)} of it is back in your store credit.` : '';

	if (type === 'phone') {
		if (status === 'completed' || delivery === 'delivered')
			return stage('delivered', 'Delivered', 'done', `Code received.${partRefund}`.trim());
		return stage(
			'in_progress',
			'In progress',
			'progress',
			'Your number is ready. Waiting for your code.'
		);
	}

	if (type === 'boosting') {
		const summary = getBoostOrderSummaryStatus({ ...order, orderItems: items });
		const reported = engagementProgress(order, items);
		const percent = reported ? Math.round((reported.delivered / reported.total) * 100) : null;
		const verified = items.some((item) => Boolean(item.boostVerifiedAt));
		if (summary === 'needs_link')
			return stage('needs_you', 'Needs you', 'you', 'This link doesn’t work. Update it to start.');
		if (summary === 'cancelled')
			return stage('cancelled', 'Cancelled', 'stop', `This boost was stopped.${partRefund}`.trim());
		if (summary === 'completed') {
			if (refunded > 0 && reported && reported.delivered < reported.total)
				return stage(
					'part_refunded',
					'Part refunded',
					'refund',
					`Delivered ${reported.delivered.toLocaleString()} of ${reported.total.toLocaleString()}.${partRefund}`,
					{ progress: percent, deliveryCheck: verified ? 'verified' : 'supplier' }
				);
			return stage(
				'delivered',
				'Delivered',
				'done',
				verified ? 'Delivered and checked on your profile.' : `Delivered.${partRefund}`.trim(),
				{ progress: 100, deliveryCheck: verified ? 'verified' : 'supplier' }
			);
		}
		if (summary === 'under_review')
			return stage(
				'checking',
				'Checking',
				'progress',
				'We’re checking this boost. No need to do anything or reorder.',
				{ progress: percent }
			);
		const lineStates = items
			.filter((item) => Boolean(item.boostTargetUrl))
			.map((item) =>
				lower(
					(item.boostProgress as { status?: string } | undefined)?.status ??
						getBoostingProgress(item, order)?.status
				)
			);
		if (lineStates.every((state) => state === 'pending' || state === 'queued'))
			return stage('preparing', 'Preparing', 'prep', 'Queued to start. No need to order again.');
		return stage(
			'in_progress',
			'In progress',
			'progress',
			percent === null
				? 'Delivering now. Progress shows here as it arrives.'
				: `Delivering · ${percent}%`,
			{ progress: percent }
		);
	}

	// Accounts.
	const viaWhatsApp = lower(order.deliveryMethod) === 'whatsapp';
	if (status === 'completed' || delivery === 'delivered')
		return stage(
			'delivered',
			'Delivered',
			'done',
			viaWhatsApp
				? `Sent on WhatsApp.${partRefund}`.trim()
				: `Your login details are ready.${partRefund}`.trim()
		);
	return stage(
		'preparing',
		'Preparing',
		'prep',
		viaWhatsApp ? 'We’ll send the login details on WhatsApp.' : 'Getting your account ready.'
	);
}

/** Faulty or wrong accounts can be reported within this long after delivery. */
export const ACCOUNT_REPORT_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Whether a delivered account order is still inside the 3-hour report window. */
export function isWithinAccountReportWindow(orderValue: unknown, now: Date = new Date()): boolean {
	const order = (orderValue && typeof orderValue === 'object' ? orderValue : {}) as Row;
	const at = order.deliveredAt ?? order.paidAt ?? order.createdAt;
	if (!(at instanceof Date) && typeof at !== 'string') return false;
	const deliveredAt = new Date(at).getTime();
	return Number.isFinite(deliveredAt) && now.getTime() - deliveredAt <= ACCOUNT_REPORT_WINDOW_MS;
}
