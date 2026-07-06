import { describe, expect, it } from 'vitest';
import { computeOrderRedemption, EARNED_REDEMPTION_CAP_PERCENT } from './store-credit';

describe('computeOrderRedemption', () => {
	it('applies refund credit first, uncapped up to the order total', () => {
		// ₦10k order, ₦10k refund credit → refund covers it all, no earned needed.
		expect(computeOrderRedemption(10000, { refundAvailable: 10000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 10000,
			earnedApplied: 0,
			totalApplied: 10000
		});
	});

	it('caps earned/gifted credit at 30% of the order', () => {
		// ₦10k order, no refund, ₦5k earned → earned capped at ₦3,000 (30%).
		expect(computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 5000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 3000,
			totalApplied: 3000
		});
	});

	it('combines refund (free) then earned (capped) without exceeding the order', () => {
		// ₦10k order, ₦4k refund + ₦5k earned → refund ₦4k, remaining ₦6k, earned capped ₦3k.
		expect(computeOrderRedemption(10000, { refundAvailable: 4000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 4000,
			earnedApplied: 3000,
			totalApplied: 7000
		});
	});

	it('never applies more than the order total (refund covers everything)', () => {
		// ₦2k order, ₦9k refund → only ₦2k applied.
		expect(computeOrderRedemption(2000, { refundAvailable: 9000, earnedAvailable: 9000 })).toEqual({
			refundApplied: 2000,
			earnedApplied: 0,
			totalApplied: 2000
		});
	});

	it('earned is bounded by the remainder after refund, not just the 30% cap', () => {
		// ₦10k order, ₦8k refund → remaining ₦2k; earned cap is ₦3k but only ₦2k remains.
		expect(computeOrderRedemption(10000, { refundAvailable: 8000, earnedAvailable: 9000 })).toEqual({
			refundApplied: 8000,
			earnedApplied: 2000,
			totalApplied: 10000
		});
	});

	it('uses only what earned credit the user actually has (under the cap)', () => {
		// ₦10k order, ₦1k earned only → applies ₦1k (below the ₦3k cap).
		expect(computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 1000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 1000,
			totalApplied: 1000
		});
	});

	it('handles zero / no-credit gracefully', () => {
		expect(computeOrderRedemption(0, { refundAvailable: 5000, earnedAvailable: 5000 })).toEqual({
			refundApplied: 0,
			earnedApplied: 0,
			totalApplied: 0
		});
		expect(computeOrderRedemption(5000, { refundAvailable: 0, earnedAvailable: 0 })).toEqual({
			refundApplied: 0,
			earnedApplied: 0,
			totalApplied: 0
		});
	});

	it('floors the 30% cap to whole naira', () => {
		// ₦1,999 order → 30% = 599.7 → floored to ₦599.
		const r = computeOrderRedemption(1999, { refundAvailable: 0, earnedAvailable: 9000 });
		expect(r.earnedApplied).toBe(Math.floor(1999 * EARNED_REDEMPTION_CAP_PERCENT));
		expect(r.earnedApplied).toBe(599);
	});

	it('respects a custom cap percent', () => {
		expect(
			computeOrderRedemption(10000, { refundAvailable: 0, earnedAvailable: 9000 }, { earnedCapPercent: 0.5 })
		).toEqual({ refundApplied: 0, earnedApplied: 5000, totalApplied: 5000 });
	});
});
