import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), read: vi.fn() }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.permission }));
vi.mock('$lib/server/boosting-providers/balances', () => ({
	readBoostSupplierBalances: mocks.read
}));
import { GET } from './+server';
const event = (query = '', user: object | null = { id: 'admin' }) =>
	({
		locals: { user, adminContext: {} },
		url: new URL(`http://localhost/api/admin/boosting-suppliers/balances${query}`),
		setHeaders: vi.fn()
	}) as never;
beforeEach(() => {
	vi.clearAllMocks();
	mocks.permission.mockReturnValue(true);
	mocks.read.mockResolvedValue([]);
});
it('requires a signed-in catalogue manager before any balance call', async () => {
	expect((await GET(event('', null))).status).toBe(403);
	mocks.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect(mocks.read).not.toHaveBeenCalled();
});
it('validates supplier IDs before any balance call', async () => {
	expect((await GET(event('?provider=unknown'))).status).toBe(400);
	expect(mocks.read).not.toHaveBeenCalled();
});
it('serves private, uncached balance reads without invoking catalogue or pricing actions', async () => {
	const request = event('?provider=bulk_follows');
	expect((await GET(request)).status).toBe(200);
	expect(mocks.read).toHaveBeenCalledWith('bulk_follows');
	expect((request as { setHeaders: ReturnType<typeof vi.fn> }).setHeaders).toHaveBeenCalledWith({
		'cache-control': 'private, no-store'
	});
	await GET(event());
	expect(mocks.read).toHaveBeenLastCalledWith(undefined);
});
