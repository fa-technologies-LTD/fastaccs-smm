import { describe, expect, it } from 'vitest';
import {
	calculateSuperOrderCommission,
	calculateSuperReferralProgress,
	superActivationSpendForOrder
} from './affiliate-policy';
import {
	buildGoodsCostSnapshot,
	goodsCostFromOrderMetadata,
	parseTierUnitCost,
	superBonusWindowEnd
} from './super-affiliate-terms';

const SWITCHOVER = new Date('2026-11-01T00:00:00.000Z');
const BEFORE = new Date('2026-10-20T10:00:00.000Z');
const AFTER = new Date('2026-11-05T10:00:00.000Z');

describe('Super profit commission (5% of profit on the cash-paid share)', () => {
	it('₦2,000 sale, ₦1,200 cost → ₦800 profit → ₦40', () => {
		expect(
			calculateSuperOrderCommission({ totalAmount: 2_000, goodsCostNgn: 1_200, percent: 5 })
		).toEqual({ amount: 40, held: false, profit: 800 });
	});

	it('₦5,000 order, ₦2,500 cash + ₦2,500 credit, ₦3,000 cost → ₦1,000 profit → ₦50', () => {
		expect(
			calculateSuperOrderCommission({
				totalAmount: 5_000,
				storeCreditApplied: 2_500,
				goodsCostNgn: 3_000,
				percent: 5
			})
		).toEqual({ amount: 50, held: false, profit: 1_000 });
	});

	it('is never negative on a loss', () => {
		expect(
			calculateSuperOrderCommission({ totalAmount: 2_000, goodsCostNgn: 2_600, percent: 5 })
		).toEqual({ amount: 0, held: false, profit: 0 });
	});

	it('holds (never estimates) when the cost is blank', () => {
		expect(
			calculateSuperOrderCommission({ totalAmount: 2_000, goodsCostNgn: null, percent: 5 })
		).toEqual({ amount: 0, held: true, profit: 0 });
	});

	it('earns nothing on an order paid fully with store credit', () => {
		expect(
			calculateSuperOrderCommission({
				totalAmount: 5_000,
				storeCreditApplied: 5_000,
				goodsCostNgn: 3_000,
				percent: 5
			}).amount
		).toBe(0);
	});

	it('scales down with a refund and reaches ₦0 on a full refund', () => {
		const half = calculateSuperOrderCommission({
			totalAmount: 2_000,
			refundedAmount: 1_000,
			goodsCostNgn: 1_200,
			percent: 5
		});
		expect(half.amount).toBe(20);
		expect(
			calculateSuperOrderCommission({
				totalAmount: 2_000,
				refundedAmount: 2_000,
				goodsCostNgn: 1_200,
				percent: 5
			}).amount
		).toBe(0);
	});
});

describe('Super activation spend around the switchover', () => {
	const creditOrder = { totalAmount: 5_000, storeCreditApplied: 5_000, refundedAmount: 0 };

	it('keeps today’s terms (kept order value) for orders paid before the switchover', () => {
		expect(superActivationSpendForOrder({ ...creditOrder, paidAt: BEFORE }, SWITCHOVER)).toBe(
			5_000
		);
	});

	it('counts only kept cash from the switchover', () => {
		expect(
			superActivationSpendForOrder(
				{ totalAmount: 5_000, storeCreditApplied: 2_000, refundedAmount: 0, paidAt: AFTER },
				SWITCHOVER
			)
		).toBe(3_000);
		expect(superActivationSpendForOrder({ ...creditOrder, paidAt: AFTER }, SWITCHOVER)).toBe(0);
	});

	it('does not count a fully credit-paid order as one of the 3 orders after the switchover', () => {
		const progress = calculateSuperReferralProgress({
			orders: [
				{ ...creditOrder, paidAt: AFTER },
				{ ...creditOrder, paidAt: AFTER },
				{ ...creditOrder, paidAt: AFTER }
			],
			enabled: true,
			spendThreshold: 3_500,
			orderThreshold: 3,
			switchoverAt: SWITCHOVER
		});
		expect(progress).toEqual({ orderCount: 0, cumulativeSpend: 0, activated: false });
	});

	it('behaves exactly as today when no switchover is set', () => {
		const progress = calculateSuperReferralProgress({
			orders: [{ ...creditOrder, paidAt: AFTER }],
			enabled: true,
			spendThreshold: 3_500,
			orderThreshold: 3
		});
		expect(progress).toEqual({ orderCount: 1, cumulativeSpend: 5_000, activated: true });
	});
});

describe('tier cost saved on the order', () => {
	it('reads a tier cost, treating blank as "no cost"', () => {
		expect(parseTierUnitCost({ unit_cost_ngn: 1_200 })).toBe(1_200);
		expect(parseTierUnitCost({ unit_cost_ngn: '0' })).toBe(0);
		expect(parseTierUnitCost({ unit_cost_ngn: '' })).toBeNull();
		expect(parseTierUnitCost({})).toBeNull();
	});

	it('totals cost × quantity, and returns null if any line has no cost or has an add-on', () => {
		const snapshot = buildGoodsCostSnapshot([
			{ orderItemId: 'a', categoryId: 't1', quantity: 2, categoryMetadata: { unit_cost_ngn: 500 } },
			{ orderItemId: 'b', categoryId: 't2', quantity: 1, categoryMetadata: { unit_cost_ngn: 200 } }
		]);
		expect(goodsCostFromOrderMetadata({ goodsCost: snapshot })).toBe(1_200);
		const missing = buildGoodsCostSnapshot([
			{ orderItemId: 'a', categoryId: 't1', quantity: 1, categoryMetadata: {} }
		]);
		expect(goodsCostFromOrderMetadata({ goodsCost: missing })).toBeNull();
		const addon = buildGoodsCostSnapshot([
			{
				orderItemId: 'a',
				categoryId: 't1',
				quantity: 1,
				categoryMetadata: { unit_cost_ngn: 500 },
				hasAddon: true
			}
		]);
		expect(goodsCostFromOrderMetadata({ goodsCost: addon })).toBeNull();
		expect(goodsCostFromOrderMetadata({})).toBeNull();
	});
});

describe('monthly bonus window', () => {
	it('stops counting activations at the switchover', () => {
		const monthEnd = new Date('2026-12-01T00:00:00.000Z');
		expect(superBonusWindowEnd(monthEnd, SWITCHOVER)).toEqual(SWITCHOVER);
		expect(superBonusWindowEnd(monthEnd, null)).toEqual(monthEnd);
		expect(superBonusWindowEnd(monthEnd, new Date('2027-01-01T00:00:00.000Z'))).toEqual(monthEnd);
	});
});
