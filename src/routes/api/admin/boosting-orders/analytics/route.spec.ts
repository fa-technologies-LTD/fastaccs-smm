import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ permission: vi.fn(), analytics: vi.fn() }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/services/boosting-analytics', () => ({ getBoostingAnalytics: mock.analytics }));
import { GET } from './+server';
const event = (revenue = true) =>
	({
		locals: { user: { id: 'owner' }, adminContext: { canViewRevenue: revenue } },
		setHeaders: vi.fn()
	}) as unknown as Parameters<typeof GET>[0];
beforeEach(() => {
	vi.clearAllMocks();
	mock.permission.mockReturnValue(true);
	mock.analytics.mockResolvedValue({ overall: { items: 1 } });
});
it('requires an admin session before accessing reporting', async () => {
	mock.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(401);
	expect(mock.analytics).not.toHaveBeenCalled();
});
it('passes revenue restrictions through to the service and prevents caching', async () => {
	const e = event(false);
	expect((await GET(e)).status).toBe(200);
	expect(mock.analytics).toHaveBeenCalledWith(false);
	expect(e.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
});
it('fails reporting safely without inventing zero totals', async () => {
	mock.analytics.mockRejectedValue(new Error('db offline'));
	expect((await GET(event())).status).toBe(503);
});
