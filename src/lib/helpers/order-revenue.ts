export const REVENUE_ORDER_STATUSES = ['paid', 'completed'] as const;
const REVENUE_STATUS_SET = new Set<string>(REVENUE_ORDER_STATUSES);

/**
 * The marker any refund path writes onto an order. A refund can land on `status`
 * (full refund), `paymentStatus` (full + per-account refunds), or `deliveryStatus`
 * (the Numbers auto-refund, plus legacy phone orders whose payment fields were never
 * flipped). Money that went back to the customer is not revenue on ANY of them.
 */
export const REFUNDED_MARKER = 'refunded';

export function moneyAmount(value: unknown): number {
	const amount = Number(value || 0);
	return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/** Original sale value minus money returned. Tender (card/store credit) does not change sales. */
export function toNetSales(totalAmount: unknown, refundedAmount: unknown): number {
	return Math.max(0, moneyAmount(totalAmount) - moneyAmount(refundedAmount));
}

/** New external payment received at checkout. This is cash intake, not revenue/sales. */
export function toExternalCash(totalAmount: unknown, storeCreditApplied: unknown): number {
	return Math.max(0, moneyAmount(totalAmount) - moneyAmount(storeCreditApplied));
}

type RefundableOrderItem = {
	id: string;
	totalPrice: unknown;
	refundedAmount?: unknown;
};

/**
 * Build exact item-level targets for a full refund without reducing an earlier item refund.
 * Working in kobo keeps the sum equal to the order total even when discounts make the
 * proportional line values fractional.
 */
export function allocateFullRefundToItems(
	totalAmount: unknown,
	items: RefundableOrderItem[]
): { targets: Array<{ id: string; refundedAmount: number }>; allocatedAmount: number } {
	const totalKobo = Math.round(moneyAmount(totalAmount) * 100);
	const grossKobo = items.reduce(
		(sum, item) => sum + Math.round(moneyAmount(item.totalPrice) * 100),
		0
	);
	let capacityLeft = totalKobo;
	const capacities = items.map((item, index) => {
		const itemGrossKobo = Math.round(moneyAmount(item.totalPrice) * 100);
		const capacity =
			index === items.length - 1
				? capacityLeft
				: Math.min(
						capacityLeft,
						grossKobo > 0 ? Math.round((totalKobo * itemGrossKobo) / grossKobo) : 0
					);
		capacityLeft -= capacity;
		return capacity;
	});

	const targetsKobo = items.map((item) => Math.round(moneyAmount(item.refundedAmount) * 100));
	const alreadyAttributed = targetsKobo.reduce((sum, value) => sum + value, 0);
	if (alreadyAttributed > totalKobo) {
		throw new Error('ITEM_REFUNDS_EXCEED_ORDER_TOTAL');
	}

	let remaining = totalKobo - alreadyAttributed;
	for (let index = 0; index < items.length && remaining > 0; index += 1) {
		const available = Math.max(0, capacities[index] - targetsKobo[index]);
		const increment = Math.min(remaining, available);
		targetsKobo[index] += increment;
		remaining -= increment;
	}

	const allocatedKobo = targetsKobo.reduce((sum, value) => sum + value, 0);
	return {
		targets: items.map((item, index) => ({
			id: item.id,
			refundedAmount: targetsKobo[index] / 100
		})),
		allocatedAmount: allocatedKobo / 100
	};
}

export function isRefundedOrder(input: {
	status?: string | null;
	paymentStatus?: string | null;
	deliveryStatus?: string | null;
	refundedAmount?: unknown;
}): boolean {
	return (
		normalize(input.status) === REFUNDED_MARKER ||
		normalize(input.paymentStatus) === REFUNDED_MARKER ||
		normalize(input.deliveryStatus) === REFUNDED_MARKER ||
		moneyAmount(input.refundedAmount) > 0
	);
}

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
 * NOTE: a PARTIAL (per-account) refund deliberately still counts as a sale. Callers use
 * `toNetSales(totalAmount, refundedAmount)` to retain only the unrefunded portion.
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
