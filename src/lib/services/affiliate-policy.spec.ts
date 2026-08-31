import { describe, expect, it } from 'vitest';
import {
	calculateAffiliateBuyerDiscount,
	calculateRetainedAffiliateBuyerDiscount,
	calculateRegularAffiliateReward,
	calculateSuperMonthlyBonusIncrement,
	calculateSuperReferralProgress,
	getHighestSuperMonthlyTier,
	isAffiliateEligibleOrderType
} from './affiliate-policy';

const POLICY = {
	discountPercent: 5,
	discountCap: 1_000,
	discountedOrderLimit: 2,
	excludedKeywords: []
};

describe('approved regular affiliate policy', () => {
	it('limits buyer discounts to 5% on the first two account orders, capped at ₦1,000', () => {
		for (const priorOrders of [0, 1]) {
			const result = calculateAffiliateBuyerDiscount({
				successfulAccountOrdersBefore: priorOrders,
				orderItems: [{ productName: 'Instagram Account', totalPrice: 30_000 }],
				...POLICY
			});
			expect(result.discountAmount).toBe(1_000);
			expect(result.orderIndex).toBe(priorOrders + 1);
		}

		const third = calculateAffiliateBuyerDiscount({
			successfulAccountOrdersBefore: 2,
			orderItems: [{ productName: 'Instagram Account', totalPrice: 30_000 }],
			...POLICY
		});
		expect(third.discountAmount).toBe(0);
	});

	it('never treats Numbers or Boosting as affiliate-eligible order types', () => {
		expect(isAffiliateEligibleOrderType('account')).toBe(true);
		expect(isAffiliateEligibleOrderType('phone')).toBe(false);
		expect(isAffiliateEligibleOrderType('boosting')).toBe(false);
	});

	it('excludes privately ineligible account items without exposing supplier logic', () => {
		const result = calculateAffiliateBuyerDiscount({
			successfulAccountOrdersBefore: 0,
			orderItems: [
				{ productName: 'Eligible account', totalPrice: 10_000 },
				{ productName: '0F low-margin account', totalPrice: 50_000 }
			],
			...POLICY,
			excludedKeywords: ['0f']
		});
		expect(result.discountAmount).toBe(500);
	});

	it('calculates rewards from retained eligible cash value and enforces the ₦1,000 cap', () => {
		const reward = calculateRegularAffiliateReward({
			subtotal: 30_000,
			// The caller has already removed the store-credit-funded portion.
			totalAmount: 25_000,
			orderItems: [
				{ id: 'kept', productName: 'Kept account', totalPrice: 20_000, refundedAmount: 0 },
				{ id: 'refunded', productName: 'Faulty account', totalPrice: 10_000, refundedAmount: 5_000 }
			],
			rewardPercent: 5,
			rewardCap: 1_000,
			excludedKeywords: []
		});

		expect(reward.commissionBaseAmount).toBeCloseTo(20_000, 2);
		expect(reward.amount).toBe(1_000);
		expect(reward.eligibleOrderItemIds).toEqual(['kept', 'refunded']);
	});

	it('uses the original eligible-item snapshot during later refund reconciliation', () => {
		const reward = calculateRegularAffiliateReward({
			subtotal: 20_000,
			totalAmount: 20_000,
			orderItems: [
				{ id: 'promised', productName: 'Renamed later', totalPrice: 10_000, refundedAmount: 5_000 },
				{ id: 'not-promised', productName: 'Other', totalPrice: 10_000, refundedAmount: 0 }
			],
			rewardPercent: 5,
			rewardCap: 1_000,
			excludedKeywords: ['renamed'],
			eligibleOrderItemIds: ['promised']
		});

		expect(reward.commissionBaseAmount).toBe(5_000);
		expect(reward.amount).toBe(250);
		expect(reward.eligibleOrderItemIds).toEqual(['promised']);
	});

	it('never rewards more than external cash retained after a mixed-credit partial refund', () => {
		const reward = calculateRegularAffiliateReward({
			subtotal: 22_500,
			// ₦5,000 of the order was paid with Store Credit.
			totalAmount: 17_500,
			orderRefundedAmount: 7_500,
			orderItems: [
				{ id: 'refunded', productName: 'Faulty account', totalPrice: 7_500, refundedAmount: 7_500 },
				{ id: 'kept-1', productName: 'Kept account', totalPrice: 7_500, refundedAmount: 0 },
				{ id: 'kept-2', productName: 'Kept account', totalPrice: 7_500, refundedAmount: 0 }
			],
			rewardPercent: 5,
			rewardCap: 1_000,
			excludedKeywords: []
		});

		expect(reward.commissionBaseAmount).toBe(10_000);
		expect(reward.amount).toBe(500);
	});

	it('reports only the buyer discount retained after a partial refund', () => {
		expect(
			calculateRetainedAffiliateBuyerDiscount({
				totalAmount: 9_500,
				refundedAmount: 4_750,
				discountAmount: 500
			})
		).toBe(250);
		expect(
			calculateRetainedAffiliateBuyerDiscount({
				totalAmount: 9_500,
				refundedAmount: 9_500,
				discountAmount: 500
			})
		).toBe(0);
	});

	it('treats super tiers as non-additive monthly totals', () => {
		const tiers = [
			{ count: 10, amount: 3_000 },
			{ count: 20, amount: 8_000 },
			{ count: 30, amount: 15_000 }
		];

		expect(getHighestSuperMonthlyTier(tiers, 9)).toBeNull();
		expect(getHighestSuperMonthlyTier(tiers, 10)).toEqual({ count: 10, amount: 3_000 });
		expect(getHighestSuperMonthlyTier(tiers, 24)).toEqual({ count: 20, amount: 8_000 });
		expect(getHighestSuperMonthlyTier(tiers, 30)).toEqual({ count: 30, amount: 15_000 });

		expect(calculateSuperMonthlyBonusIncrement(3_000, 0)).toBe(3_000);
		expect(calculateSuperMonthlyBonusIncrement(8_000, 3_000)).toBe(5_000);
		expect(calculateSuperMonthlyBonusIncrement(15_000, 8_000)).toBe(7_000);
		expect(calculateSuperMonthlyBonusIncrement(8_000, 8_000)).toBe(0);
	});

	it('qualifies one super referral at retained ₦3,500 spend or three retained orders', () => {
		expect(
			calculateSuperReferralProgress({
				orders: [{ totalAmount: 4_000, refundedAmount: 500 }],
				enabled: true,
				spendThreshold: 3_500,
				orderThreshold: 3
			})
		).toEqual({ orderCount: 1, cumulativeSpend: 3_500, activated: true });

		expect(
			calculateSuperReferralProgress({
				orders: [{ totalAmount: 1_000 }, { totalAmount: 1_000 }, { totalAmount: 1_000 }],
				enabled: true,
				spendThreshold: 3_500,
				orderThreshold: 3
			})
		).toEqual({ orderCount: 3, cumulativeSpend: 3_000, activated: true });

		expect(
			calculateSuperReferralProgress({
				orders: [{ totalAmount: 3_500, refundedAmount: 1 }],
				enabled: true,
				spendThreshold: 3_500,
				orderThreshold: 3
			})
		).toEqual({ orderCount: 1, cumulativeSpend: 3_499, activated: false });
	});
});
