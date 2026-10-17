import { moneyNgn } from './money';
import { promoSpendableForOrder, type PromoCampaignBalance } from './promo-credit';

export const EARNED_REDEMPTION_CAP_PERCENT = 0.3;
export interface OrderRedemption {
	refundApplied: number;
	earnedApplied: number;
	/** Promo credit (Refer & Win / BIGSPENDER). Absent = 0. */
	promoApplied?: number;
	totalApplied: number;
}

/**
 * Shared preview/accounting rule on the order total after discounts. Promo credit is used first
 * (it expires) up to its campaign cap, then refund credit (kobo allowed), then earned credit
 * (capped, whole naira). With no promo credit the result is identical to the two-bucket rule.
 */
export function computeOrderRedemption(
	orderTotal: number,
	buckets: {
		earnedAvailable: number;
		refundAvailable: number;
		promo?: ReadonlyArray<Pick<PromoCampaignBalance, 'campaign' | 'available'>>;
	},
	options: { earnedCapPercent?: number; promoCaps?: Readonly<Record<string, number>> } = {}
): OrderRedemption {
	const total = moneyNgn(orderTotal);
	const promoApplied = Math.max(
		0,
		Math.min(
			promoSpendableForOrder(total, buckets.promo ?? [], options.promoCaps),
			Math.floor(total)
		)
	);
	const afterPromo = moneyNgn(total - promoApplied);
	const refundApplied = Math.min(moneyNgn(buckets.refundAvailable), afterPromo);
	const rawEarned = Number(buckets.earnedAvailable);
	const earnedAvailable = Number.isFinite(rawEarned) ? Math.max(0, Math.floor(rawEarned)) : 0;
	const earnedApplied = Math.max(
		0,
		Math.min(
			earnedAvailable,
			Math.floor(total * (options.earnedCapPercent ?? EARNED_REDEMPTION_CAP_PERCENT)),
			Math.floor(moneyNgn(afterPromo - refundApplied))
		)
	);
	return {
		refundApplied,
		earnedApplied,
		// Present only when promo credit is used, so the no-promo result is unchanged.
		...(promoApplied > 0 ? { promoApplied } : {}),
		totalApplied: moneyNgn(refundApplied + earnedApplied + promoApplied)
	};
}
