import { moneyNgn } from './money';

export const EARNED_REDEMPTION_CAP_PERCENT = 0.3;
export interface OrderRedemption {
	refundApplied: number;
	earnedApplied: number;
	totalApplied: number;
}

/** Shared preview/accounting rule. Refunds retain kobo; earned credit spends whole naira. */
export function computeOrderRedemption(
	orderTotal: number,
	buckets: { earnedAvailable: number; refundAvailable: number },
	options: { earnedCapPercent?: number } = {}
): OrderRedemption {
	const total = moneyNgn(orderTotal);
	const refundApplied = Math.min(moneyNgn(buckets.refundAvailable), total);
	const rawEarned = Number(buckets.earnedAvailable);
	const earnedAvailable = Number.isFinite(rawEarned) ? Math.max(0, Math.floor(rawEarned)) : 0;
	const earnedApplied = Math.max(
		0,
		Math.min(
			earnedAvailable,
			Math.floor(total * (options.earnedCapPercent ?? EARNED_REDEMPTION_CAP_PERCENT)),
			Math.floor(moneyNgn(total - refundApplied))
		)
	);
	return { refundApplied, earnedApplied, totalApplied: moneyNgn(refundApplied + earnedApplied) };
}
