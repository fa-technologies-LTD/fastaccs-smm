import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), boostProviderState: { findMany: vi.fn() } }));
vi.mock('$lib/prisma', () => ({ prisma: db }));
import { getBoostingAnalytics } from './boosting-analytics';

beforeEach(() => {
	vi.clearAllMocks();
	db.$queryRaw.mockResolvedValue([
		{
			categoryId: null,
			name: null,
			platform: null,
			outcome: null,
			orders: 2n,
			items: 3n,
			completed: 2n,
			knownCosts: 1n,
			netSales: 1200,
			supplierCost: 300,
			recordedMargin: 100
		}
	]);
	db.boostProviderState.findMany.mockResolvedValue([
		{
			provider: 'smm_raja',
			label: 'SMM Raja',
			balance: 5.25,
			currency: 'USD',
			enabled: true,
			circuitOpen: false,
			lastBalanceSuccessAt: new Date('2026-10-11T12:00:00Z')
		}
	]);
});
it('keeps order and item counts distinct, with explicit cost coverage', async () => {
	const a = await getBoostingAnalytics(true, db as never, new Date('2026-10-11T14:00:00Z'));
	expect(a.overall).toMatchObject({
		orders: 2,
		items: 3,
		completed: 2,
		completionRate: 67,
		knownCostItems: 1,
		recordedMarginNgn: 100
	});
	expect(a.since).toBe('2026-09-11T14:00:00.000Z');
	expect(a.providers[0].lastBalanceSuccessAt).toBe('2026-10-11T12:00:00.000Z');
});
it('reports missing supplier costs as unknown, not zero-margin-free stock', async () => {
	db.$queryRaw.mockResolvedValue([
		{
			categoryId: null,
			orders: 1,
			items: 1,
			completed: 1,
			knownCosts: 0,
			netSales: 500,
			supplierCost: 0,
			recordedMargin: 0
		}
	]);
	expect((await getBoostingAnalytics(true, db as never)).overall).toMatchObject({
		supplierCostNgn: null,
		recordedMarginNgn: null
	});
});
it('does not invent payment fees or advertise final profit when fees are not recorded', async () => {
	expect((await getBoostingAnalytics(true, db as never)).overall).toMatchObject({
		paymentFeesNgn: null,
		profitAfterPaymentFeesNgn: null
	});
});
it('redacts revenue and provider account balances for restricted admins', async () => {
	const a = await getBoostingAnalytics(false, db as never);
	expect(a.overall).toMatchObject({
		netSalesNgn: null,
		supplierCostNgn: null,
		recordedMarginNgn: null
	});
	expect(a.providers).toEqual([]);
	expect(db.boostProviderState.findMany).not.toHaveBeenCalled();
});
it('uses paid history, discount/refund attribution and historical final charges, not quoted costs', async () => {
	await getBoostingAnalytics(true, db as never);
	const query = db.$queryRaw.mock.calls[0][0];
	expect(query.sql).toContain('COUNT(DISTINCT order_id)');
	expect(query.sql).toContain('charges.total_usd * f.fx_ngn_per_usd');
	expect(query.sql).toContain('DISTINCT ON (a.provider_key, a.supplier_order_id)');
	expect(query.sql).toContain("a.type='status_poll'");
	expect(query.sql).toContain('count(charge)=count(*)');
	expect(query.sql).toContain('order_refund - attributed_refund');
	expect(query.sql).toContain('full_refund THEN 0');
	expect(query.sql).not.toMatch(/quoted_supplier|projected_margin/);
	expect(query.values.every((v: unknown) => v instanceof Date)).toBe(true);
});
