import { describe, it, expect } from 'vitest';
import { buildRevenueOrderWhere, buildRewardSpendOrderWhere } from './order-revenue.server';

describe('reward spend', () => {
	it('counts revenue orders only when their payment was confirmed', () => {
		const where = buildRewardSpendOrderWhere();
		expect(where).toEqual({
			AND: [buildRevenueOrderWhere(), { paymentStatus: { in: ['paid', 'success', 'overpaid'] } }]
		});
		// A "completed" order whose payment failed is revenue-shaped but must never unlock a reward.
		const paymentRule = (where.AND as Array<{ paymentStatus?: { in: string[] } }>)[1];
		expect(paymentRule.paymentStatus?.in).not.toContain('failed');
		expect(paymentRule.paymentStatus?.in).not.toContain('pending');
	});
});
