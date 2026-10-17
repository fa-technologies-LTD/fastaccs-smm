export interface AffiliatePolicyItem {
	id?: string;
	productName: string;
	totalPrice: unknown;
	refundedAmount?: unknown;
	metadata?: unknown;
}

export interface AffiliateRewardSnapshot {
	amount: number;
	commissionBaseAmount: number;
	eligibleOrderItemIds: string[];
	rewardPercent: number;
	rewardCap: number;
}

export interface SuperMonthlyTier {
	count: number;
	amount: number;
}

export interface SuperReferralProgress {
	orderCount: number;
	cumulativeSpend: number;
	activated: boolean;
}

function money(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, parsed);
}

function setting(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function flag(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	return ['1', 'true', 'yes', 'on'].includes(
		String(value || '')
			.trim()
			.toLowerCase()
	);
}

function metadataObject(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function isAffiliateEligibleOrderType(orderType: string | null | undefined): boolean {
	return (
		String(orderType || '')
			.trim()
			.toLowerCase() === 'account'
	);
}

export function getHighestSuperMonthlyTier(
	tiers: readonly SuperMonthlyTier[],
	activationCount: number
): SuperMonthlyTier | null {
	const count = Math.max(0, Math.floor(setting(activationCount, 0)));
	return (
		[...tiers]
			.map((tier) => ({
				count: Math.max(1, Math.floor(setting(tier.count, 1))),
				amount: money(tier.amount)
			}))
			.sort((a, b) => b.count - a.count)
			.find((tier) => count >= tier.count) || null
	);
}

/**
 * Super tiers are monthly totals, not amounts added on top of one another. This
 * returns only the amount still needed to reach the currently earned tier total.
 */
export function calculateSuperMonthlyBonusIncrement(
	targetTierTotal: unknown,
	alreadyAwardedNet: unknown
): number {
	return Math.max(0, Math.round((money(targetTierTotal) - money(alreadyAwardedNet)) * 100) / 100);
}

export interface SuperProgressOrder {
	totalAmount: unknown;
	refundedAmount?: unknown;
	storeCreditApplied?: unknown;
	paidAt?: Date | string | null;
	createdAt?: Date | string | null;
}

function orderPaidAt(order: SuperProgressOrder): Date | null {
	const value = order.paidAt ?? order.createdAt ?? null;
	if (!value) return null;
	const at = new Date(value);
	return Number.isNaN(at.getTime()) ? null : at;
}

/** True when an order falls under the Super terms that start at the switchover date. */
export function isOnNewSuperTerms(order: SuperProgressOrder, switchoverAt: Date | null): boolean {
	const at = orderPaidAt(order);
	return Boolean(switchoverAt && at && at >= switchoverAt);
}

/** Cash the customer actually paid on this order and kept (store credit is never cash). */
export function retainedCashPaid(order: SuperProgressOrder): number {
	const total = money(order.totalAmount);
	if (total <= 0) return 0;
	const cash = Math.max(0, total - money(order.storeCreditApplied));
	const retainedShare = Math.max(0, total - money(order.refundedAmount)) / total;
	return Math.round(cash * retainedShare * 100) / 100;
}

/** Spend an order contributes towards Super activation. Orders paid before the switchover keep
 * today's terms (kept order value); from the switchover only kept cash counts. */
export function superActivationSpendForOrder(
	order: SuperProgressOrder,
	switchoverAt: Date | null = null
): number {
	if (isOnNewSuperTerms(order, switchoverAt)) return retainedCashPaid(order);
	return Math.max(0, money(order.totalAmount) - money(order.refundedAmount));
}

/** From the switchover, an order paid entirely with store credit does not count as an order. */
export function superOrderCountsTowardActivation(
	order: SuperProgressOrder,
	switchoverAt: Date | null = null
): boolean {
	return isOnNewSuperTerms(order, switchoverAt) ? retainedCashPaid(order) > 0 : true;
}

export interface SuperOrderCommission {
	amount: number;
	/** No goods cost was saved for this order: hold for review, never estimate. */
	held: boolean;
	/** Internal only (admin/audit). Never show cost or profit to an affiliate. */
	profit: number;
}

/**
 * Super commission after activation: percent × (cash paid − goods cost attributable to the cash
 * share), scaled down by any refund, never below ₦0. Rounded down to the whole naira.
 * Example: ₦5,000 order, ₦2,500 cash + ₦2,500 credit, ₦3,000 cost → ₦1,500 attributable cost,
 * ₦1,000 profit → ₦50 at 5%.
 */
export function calculateSuperOrderCommission(input: {
	totalAmount: unknown;
	storeCreditApplied?: unknown;
	refundedAmount?: unknown;
	goodsCostNgn: number | null;
	percent: number;
}): SuperOrderCommission {
	const total = money(input.totalAmount);
	if (input.goodsCostNgn === null || !Number.isFinite(input.goodsCostNgn)) {
		return { amount: 0, held: true, profit: 0 };
	}
	if (total <= 0) return { amount: 0, held: false, profit: 0 };
	const cash = Math.max(0, total - money(input.storeCreditApplied));
	const attributableCost = Math.max(0, input.goodsCostNgn) * (cash / total);
	const retainedShare = Math.max(0, total - money(input.refundedAmount)) / total;
	const profit = Math.max(0, Math.round((cash - attributableCost) * retainedShare * 100) / 100);
	const amount = Math.max(0, Math.floor((profit * setting(input.percent, 0)) / 100 + 1e-9));
	return { amount, held: false, profit };
}

export function calculateSuperReferralProgress(input: {
	orders: ReadonlyArray<SuperProgressOrder>;
	enabled: boolean;
	spendThreshold: unknown;
	orderThreshold: unknown;
	switchoverAt?: Date | null;
}): SuperReferralProgress {
	const switchoverAt = input.switchoverAt ?? null;
	const orderCount = input.orders.filter((order) =>
		superOrderCountsTowardActivation(order, switchoverAt)
	).length;
	const cumulativeSpend =
		Math.round(
			input.orders.reduce(
				(sum, order) => sum + superActivationSpendForOrder(order, switchoverAt),
				0
			) * 100
		) / 100;
	const spendThreshold = Math.max(1, setting(input.spendThreshold, 3_500));
	const orderThreshold = Math.max(1, Math.floor(setting(input.orderThreshold, 3)));
	return {
		orderCount,
		cumulativeSpend,
		activated:
			Boolean(input.enabled) && (cumulativeSpend >= spendThreshold || orderCount >= orderThreshold)
	};
}

export function isAffiliateItemExcluded(
	item: Pick<AffiliatePolicyItem, 'productName' | 'metadata'>,
	excludedKeywords: readonly string[]
): boolean {
	const name = String(item.productName || '').toLowerCase();
	const metadata = metadataObject(item.metadata);
	return (
		excludedKeywords.some((keyword) =>
			name.includes(
				String(keyword || '')
					.trim()
					.toLowerCase()
			)
		) ||
		flag(metadata.affiliate_excluded) ||
		flag(metadata.affiliate_discount_excluded)
	);
}

export function calculateAffiliateBuyerDiscount(input: {
	successfulAccountOrdersBefore: number;
	orderItems: AffiliatePolicyItem[];
	discountPercent: number;
	discountCap: number;
	discountedOrderLimit: number;
	excludedKeywords: readonly string[];
}): {
	discountAmount: number;
	orderIndex: number;
	remainingDiscountedOrders: number;
	discountedOrderLimit: number;
} {
	const orderIndex = Math.max(0, Math.floor(input.successfulAccountOrdersBefore)) + 1;
	const limit = Math.max(0, Math.floor(setting(input.discountedOrderLimit, 0)));
	const remainingDiscountedOrders = Math.max(0, limit - orderIndex);
	if (orderIndex > limit || limit === 0) {
		return {
			discountAmount: 0,
			orderIndex,
			remainingDiscountedOrders: 0,
			discountedOrderLimit: limit
		};
	}

	const eligibleSubtotal = input.orderItems.reduce((sum, item) => {
		return isAffiliateItemExcluded(item, input.excludedKeywords)
			? sum
			: sum + money(item.totalPrice);
	}, 0);
	const raw = (eligibleSubtotal * setting(input.discountPercent, 0)) / 100;
	const amount = Math.min(setting(input.discountCap, 0), raw);

	return {
		discountAmount: Math.max(0, Math.floor(amount)),
		orderIndex,
		remainingDiscountedOrders,
		discountedOrderLimit: limit
	};
}

/** The share of an affiliate buyer discount that remains a real acquisition cost
 * after a partial refund. Refund amounts use the paid/net order value, so the discount
 * is reduced by the same retained-value ratio. */
export function calculateRetainedAffiliateBuyerDiscount(input: {
	totalAmount: unknown;
	refundedAmount?: unknown;
	discountAmount: unknown;
}): number {
	const totalAmount = money(input.totalAmount);
	if (totalAmount <= 0) return 0;
	const retainedRatio = Math.max(0, totalAmount - money(input.refundedAmount)) / totalAmount;
	return Math.round(money(input.discountAmount) * retainedRatio * 100) / 100;
}

/**
 * Calculate a regular affiliate reward from the amount FastAccs actually retains.
 * `totalAmount` is the paid order value after buyer discounts but before store-credit
 * payment allocation. Item refunds are already denominated in that same net-sale value.
 */
export function calculateRegularAffiliateReward(input: {
	subtotal: unknown;
	totalAmount: unknown;
	orderRefundedAmount?: unknown;
	orderItems: AffiliatePolicyItem[];
	rewardPercent: number;
	rewardCap: number;
	excludedKeywords: readonly string[];
	eligibleOrderItemIds?: readonly string[];
}): AffiliateRewardSnapshot {
	const subtotal = money(input.subtotal);
	const totalAmount = money(input.totalAmount);
	const rewardPercent = setting(input.rewardPercent, 0);
	const rewardCap = setting(input.rewardCap, 0);
	const snapshottedIds = input.eligibleOrderItemIds?.length
		? new Set(input.eligibleOrderItemIds)
		: null;

	let commissionBaseAmount = 0;
	const eligibleOrderItemIds: string[] = [];
	for (const item of input.orderItems) {
		const eligible = snapshottedIds
			? Boolean(item.id && snapshottedIds.has(item.id))
			: !isAffiliateItemExcluded(item, input.excludedKeywords);
		if (!eligible) continue;

		if (item.id) eligibleOrderItemIds.push(item.id);
		const grossLine = money(item.totalPrice);
		const originalNetLine = subtotal > 0 ? (grossLine / subtotal) * totalAmount : 0;
		const retainedNetLine = Math.max(0, originalNetLine - money(item.refundedAmount));
		commissionBaseAmount += retainedNetLine;
	}

	// Normalise currency precision before applying the percentage. Without this,
	// ordinary proportional allocation can produce 19999.999999 and incorrectly
	// turn an exact ₦1,000 reward into ₦999.
	const lineLevelCommissionBase = Math.round(commissionBaseAmount * 100) / 100;
	// A line paid partly with Store Credit can later be refunded for more than the
	// external-cash share initially allocated to that line. Without an order-level
	// ceiling, the unrecovered portion can spill past zero and leave the remaining
	// lines with an overstated commission base. Cap the result at the external cash
	// FastAccs still retains after every recorded order refund. This is deliberately
	// conservative when old records lack perfect item/source allocation.
	const retainedExternalCash = Math.max(0, totalAmount - money(input.orderRefundedAmount));
	const normalizedCommissionBase = Math.min(lineLevelCommissionBase, retainedExternalCash);
	const rawReward = Math.floor((normalizedCommissionBase * rewardPercent) / 100);
	const amount = Math.max(0, Math.floor(Math.min(rewardCap, rawReward)));
	return {
		amount,
		commissionBaseAmount: Math.max(0, normalizedCommissionBase),
		eligibleOrderItemIds,
		rewardPercent,
		rewardCap
	};
}
