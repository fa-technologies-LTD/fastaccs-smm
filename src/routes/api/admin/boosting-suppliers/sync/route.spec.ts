import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	sync: vi.fn(),
	clearCache: vi.fn(),
	auditCreate: vi.fn()
}));

vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/server/boosting-providers/catalog-sync', () => ({
	syncBoostProviderCatalogues: mocks.sync
}));
vi.mock('$lib/server/boosting-providers/discovery', () => ({
	clearBoostProviderDiscoveryCache: mocks.clearCache
}));
vi.mock('$lib/prisma', () => ({
	prisma: { adminAuditLog: { create: mocks.auditCreate } }
}));

import { POST } from './+server';

function callPost(user: { id: string } | null = { id: 'admin-1' }) {
	return POST({
		locals: { user, adminContext: {} },
		request: new Request('https://smm.fastaccs.com/api/admin/boosting-suppliers/sync', {
			method: 'POST',
			headers: { 'user-agent': 'test-browser', 'x-forwarded-for': '127.0.0.1' }
		}),
		setHeaders: vi.fn()
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.auditCreate.mockResolvedValue({});
	mocks.sync.mockResolvedValue([
		{
			provider: 'smm_raja',
			status: 'synced',
			servicesSeen: 6000,
			servicesMarkedUnavailable: 2,
			balanceWarning: null,
			error: null
		},
		{
			provider: 'bulk_follows',
			status: 'failed',
			servicesSeen: 0,
			servicesMarkedUnavailable: 0,
			balanceWarning: null,
			error: 'Supplier catalogue sync failed.'
		}
	]);
});

describe('admin supplier catalogue sync endpoint', () => {
	it('requires a catalogue admin before contacting suppliers', async () => {
		mocks.hasPermission.mockReturnValue(false);
		const response = await callPost();

		expect(response.status).toBe(403);
		expect(mocks.sync).not.toHaveBeenCalled();
	});

	it('syncs read-only catalogues and writes a compact admin audit record', async () => {
		const response = await callPost();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, data: { synced: 1, total: 2 } });
		expect(mocks.clearCache).toHaveBeenCalledOnce();
		expect(mocks.auditCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					actorUserId: 'admin-1',
					action: 'boosting_supplier_catalogue_synced',
					metadata: expect.objectContaining({ mode: 'read_only_supplier_api' })
				})
			})
		);
	});

	it('fails closed when neither catalogue can be saved', async () => {
		mocks.sync.mockResolvedValue([
			{
				provider: 'smm_raja',
				status: 'failed',
				servicesSeen: 0,
				servicesMarkedUnavailable: 0,
				balanceWarning: null,
				error: 'Unavailable'
			}
		]);

		const response = await callPost();
		const body = await response.json();
		expect(body.success).toBe(false);
		expect(body.error).toContain('No supplier catalogue');
	});
});
