import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
	db: {
		order: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
		account: { count: vi.fn(), groupBy: vi.fn() },
		user: { count: vi.fn() },
		affiliateProgram: { aggregate: vi.fn() },
		walletTransaction: { aggregate: vi.fn() },
		orderItem: { aggregate: vi.fn() },
		category: { findMany: vi.fn() },
		analyticsEvent: { groupBy: vi.fn() }
	},
	accountStats: vi.fn(),
	boostStats: vi.fn(),
	inventory: vi.fn(),
	flags: vi.fn(),
	users: vi.fn(),
	acquisition: vi.fn(),
	customers: vi.fn(),
	heatmap: vi.fn(),
	leaks: vi.fn(),
	reconciliation: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: mock.db }));
vi.mock('$lib/services/admin-metrics', () => ({
	getOrderStatsSnapshot: mock.accountStats,
	getBoostingOrderStatsSnapshot: mock.boostStats,
	getInventoryStatsSnapshot: mock.inventory
}));
vi.mock('$lib/services/admin-settings', () => ({
	getBusinessTimezoneSetting: async () => 'Africa/Lagos'
}));
vi.mock('$lib/services/feature-flags', () => ({ getFeatureFlagSnapshot: mock.flags }));
vi.mock('$lib/services/user-analytics', () => ({ getUserAnalytics: mock.users }));
vi.mock('$lib/services/acquisition-analytics', () => ({
	getAcquisitionBreakdown: mock.acquisition
}));
vi.mock('$lib/services/customer-analytics', () => ({ getCustomerAnalytics: mock.customers }));
vi.mock('$lib/services/business-insights', () => ({
	getSalesHeatmap: mock.heatmap,
	getLeakAnalysis: mock.leaks
}));
vi.mock('$lib/services/financial-reconciliation', () => ({
	getFinancialReconciliation: mock.reconciliation
}));
vi.mock('$lib/services/store-credit', () => ({ getTotalStoreCreditLiability: async () => 0 }));
vi.mock('$lib/services/affiliate', () => ({ getTotalCanonicalReferralCount: async () => 0 }));
import { load } from './+page.server';

const event = (revenueVisible = true) =>
	({
		locals: { user: { userType: 'ADMIN' }, adminContext: { canViewRevenue: revenueVisible } }
	}) as unknown as Parameters<typeof load>[0];
beforeEach(() => {
	vi.clearAllMocks();
	mock.accountStats.mockResolvedValue({ total_orders: 2, total_revenue: 10000 });
	mock.boostStats.mockResolvedValue({ total_orders: 1, total_revenue: 5000 });
	mock.inventory.mockResolvedValue({ total_available: 10 });
	mock.flags.mockResolvedValue({ adminAdvancedAnalytics: true });
	for (const loader of [mock.users, mock.acquisition, mock.customers, mock.heatmap, mock.leaks])
		loader.mockResolvedValue(null);
	mock.reconciliation.mockResolvedValue({ ok: true, issueCount: 0 });
	mock.db.order.count.mockImplementation(async ({ where } = {}) =>
		where?.orderType === 'account' ? 2 : 3
	);
	mock.db.order.aggregate.mockImplementation(async ({ where }) => {
		const scope = JSON.stringify(where);
		if (scope.includes('affiliateUserId'))
			return { _sum: { totalAmount: 2000, refundedAmount: 0 } };
		if (scope.includes('orderType')) return { _sum: { totalAmount: 10000, refundedAmount: 0 } };
		return {
			_sum: {
				totalAmount: 17000,
				refundedAmount: 2000,
				storeCreditApplied: 3000,
				discountAmount: 0,
				taxAmount: 0
			}
		};
	});
	mock.db.order.findMany.mockResolvedValue([]);
	mock.db.order.groupBy.mockResolvedValue([]);
	mock.db.account.count.mockResolvedValue(10);
	mock.db.account.groupBy.mockResolvedValue([]);
	mock.db.user.count.mockResolvedValue(4);
	mock.db.affiliateProgram.aggregate.mockResolvedValue({ _count: { id: 0 } });
	mock.db.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
	mock.db.orderItem.aggregate.mockResolvedValue({
		_sum: { totalPrice: 17000, refundedAmount: 2000 }
	});
	mock.db.category.findMany.mockResolvedValue([]);
	mock.db.analyticsEvent.groupBy.mockResolvedValue([]);
});

it('uses whole-store net sales for Overview/AOV and keeps Accounts separately scoped', async () => {
	const result = (await load(event())) as any;
	expect(result.stats.totalRevenue).toBe(15000);
	expect(result.stats.aov).toBe(5000);
	expect(result.stats.accountSales).toEqual({ totalRevenue: 10000, totalOrders: 2 });
	expect(result.stats.insights.affiliateRevenueSplit).toEqual({
		affiliate: 2000,
		nonAffiliate: 13000
	});
	expect(
		result.integrity.checks.find((check: any) => check.key === 'revenue_snapshot_vs_orders')
	).toMatchObject({ expected: 10000, actual: 10000, ok: true });
	expect(
		mock.db.order.aggregate.mock.calls.some(([input]) =>
			JSON.stringify(input.where).includes('orderType')
		)
	).toBe(true);
});
it('still flags an actual stale account snapshot, rather than hiding an integrity mismatch', async () => {
	mock.accountStats.mockResolvedValue({ total_orders: 2, total_revenue: 9000 });
	const result = (await load(event())) as any;
	expect(
		result.integrity.checks.find((check: any) => check.key === 'revenue_snapshot_vs_orders')
	).toMatchObject({ expected: 9000, actual: 10000, ok: false });
	expect(result.stats.totalRevenue).toBe(15000);
});
it('redacts whole-store and Accounts money when revenue access is absent', async () => {
	const result = (await load(event(false))) as any;
	expect(result.stats.totalRevenue).toBe(0);
	expect(result.stats.accountSales.totalRevenue).toBe(0);
	expect(result.stats.aov).toBe(0);
	expect(result.stats.revenueBreakdown.byPlatform).toEqual([]);
	expect(result.integrity.checks.every((check: any) => check.key === 'orders_total')).toBe(true);
});
