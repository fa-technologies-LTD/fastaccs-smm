import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ permission: vi.fn(), load: vi.fn() }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mock.permission }));
vi.mock('$lib/server/boosting-providers/supplier-details', () => ({
	loadBoostSupplierDetails: mock.load
}));
import { GET } from './+server';
const id = '11111111-1111-4111-8111-111111111111';
const event = (offerId = id, user: object | null = { id: 'admin' }) =>
	({
		locals: { user, adminContext: {} },
		url: new URL(`http://localhost/api/admin/boosting-pricing/supplier-details?offerId=${offerId}`),
		setHeaders: vi.fn()
	}) as never;
beforeEach(() => {
	vi.clearAllMocks();
	mock.permission.mockReturnValue(true);
	mock.load.mockResolvedValue({ offerId: id, providers: [] });
});
it('requires an authenticated catalogue manager before reading saved suppliers', async () => {
	expect((await GET(event(id, null))).status).toBe(403);
	mock.permission.mockReturnValue(false);
	expect((await GET(event())).status).toBe(403);
	expect(mock.load).not.toHaveBeenCalled();
});
it('rejects invalid offer IDs and returns private, uncached records', async () => {
	expect((await GET(event('invalid'))).status).toBe(400);
	expect(mock.load).not.toHaveBeenCalled();
	const request = event();
	const response = await GET(request);
	expect(response.status).toBe(200);
	expect(mock.load).toHaveBeenCalledWith(id);
	expect((request as { setHeaders: ReturnType<typeof vi.fn> }).setHeaders).toHaveBeenCalledWith({
		'cache-control': 'private, no-store'
	});
});
it('handles missing offers and connection failures without exposing secrets or changing data', async () => {
	mock.load.mockResolvedValueOnce(null);
	expect((await GET(event())).status).toBe(404);
	mock.load.mockRejectedValueOnce(new Error('private database credential'));
	const response = await GET(event());
	expect(response.status).toBe(503);
	expect(await response.text()).not.toContain('credential');
});
