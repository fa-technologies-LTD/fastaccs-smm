import { beforeEach, expect, it, vi } from 'vitest';
import { numbersAnalyticsFixture } from '$lib/helpers/numbers-analytics-fixtures';
const mock = vi.hoisted(() => ({
	permission: vi.fn(),
	analytics: vi.fn(),
	pricing: vi.fn(),
	hub: vi.fn(),
	pva: vi.fn(),
	hubConfigured: vi.fn(),
	pvaConfigured: vi.fn(),
	probes: vi.fn()
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/services/phone-analytics', () => ({ getNumbersAnalytics: mock.analytics }));
vi.mock('$lib/services/phone-pricing', () => ({ getPhonePricingConfig: mock.pricing }));
vi.mock('$lib/services/hubman', () => ({
	getBalanceCents: mock.hub,
	isHubmanConfigured: mock.hubConfigured
}));
vi.mock('$lib/services/pvapins', () => ({
	getBalanceCents: mock.pva,
	isPvapinsConfigured: mock.pvaConfigured
}));
vi.mock('$lib/services/phone-catalog-probe', () => ({ getPhoneCatalogProbeSummary: mock.probes }));
import { load } from './+page.server';

const event = (revenue = true, orderAmounts = true) =>
	({
		locals: { adminContext: { canViewRevenue: revenue, canViewOrderAmounts: orderAmounts } },
		setHeaders: vi.fn()
	}) as unknown as Parameters<typeof load>[0];
beforeEach(() => {
	vi.clearAllMocks();
	mock.permission.mockReturnValue(true);
	mock.analytics.mockResolvedValue(numbersAnalyticsFixture());
	mock.pricing.mockResolvedValue({ lowBalanceThresholdCents: 200 });
	mock.hubConfigured.mockReturnValue(true);
	mock.pvaConfigured.mockReturnValue(true);
	mock.hub.mockResolvedValue(802);
	mock.pva.mockResolvedValue(1852);
	mock.probes.mockResolvedValue(null);
});
it('rejects unauthorised requests before queries or provider calls', async () => {
	mock.permission.mockReturnValue(false);
	await expect(load(event())).rejects.toMatchObject({ status: 403 });
	expect(mock.analytics).not.toHaveBeenCalled();
	expect(mock.hub).not.toHaveBeenCalled();
});
it('redacts on the server and avoids supplier balance requests for an order manager', async () => {
	const e = event(false);
	const result = (await load(e)) as any;
	expect(result.analytics.overall).toMatchObject({
		revenueNgn: null,
		costNgn: null,
		marginNgn: null
	});
	expect(result.analytics.byService[0].costNgn).toBeNull();
	expect(result.analytics.recent[0]).toMatchObject({ saleNgn: 5500, costUsd: null });
	expect(result.hubBalanceCents).toBeNull();
	expect(result.pvapinsBalanceCents).toBeNull();
	expect(mock.hubConfigured).not.toHaveBeenCalled();
	expect(mock.pvaConfigured).not.toHaveBeenCalled();
	expect(mock.hub).not.toHaveBeenCalled();
	expect(mock.pva).not.toHaveBeenCalled();
	expect(e.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
});
it('retains owner figures and represents a failed balance lookup as unknown', async () => {
	mock.hub.mockRejectedValue(new Error('Unavailable'));
	const result = (await load(event())) as any;
	expect(result.analytics.overall.revenueNgn).toBe(11000);
	expect(result.hubBalanceCents).toBeNull();
	expect(result.pvapinsBalanceCents).toBe(1852);
});
it('does not substitute fake zero analytics when the database fails', async () => {
	mock.analytics.mockRejectedValue(new Error('Database unavailable'));
	await expect(load(event())).rejects.toThrow('Database unavailable');
});
