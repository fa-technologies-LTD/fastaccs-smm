import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	sync: vi.fn(),
	clearCache: vi.fn(),
	refreshPrices: vi.fn(),
	auditCreate: vi.fn()
}));

vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/server/boosting-providers/pricing-controls', () => ({
	refreshBoostAutoPrices: mocks.refreshPrices
}));
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

function callPost(user: { id: string } | null = { id: 'admin-1' }, body?: string) {
	return POST({
		locals: { user, adminContext: {} },
		request: new Request('https://smm.fastaccs.com/api/admin/boosting-suppliers/sync', {
			method: 'POST',
			body,
			headers: { 'user-agent': 'test-browser', 'x-forwarded-for': '127.0.0.1' }
		}),
		setHeaders: vi.fn()
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.refreshPrices.mockResolvedValue({ applied: 0 });
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
		expect(mocks.refreshPrices).toHaveBeenCalledOnce();
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
	it('can refresh costs without saving or automatically repricing offers', async () => {
		const response = await callPost(undefined, JSON.stringify({ refreshPrices: false }));
		expect(response.status).toBe(200);
		expect(mocks.sync).toHaveBeenCalledOnce();
		expect(mocks.refreshPrices).not.toHaveBeenCalled();
	});
	it('rejects malformed refresh options before contacting suppliers', async () => {
		for (const body of ['{', 'null', '[]', '{"refreshPrices":"false"}']) {
			const response = await callPost(undefined, body);
			expect(response.status).toBe(400);
		}
		expect(mocks.sync).not.toHaveBeenCalled();
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
		expect(mocks.refreshPrices).not.toHaveBeenCalled();
	});
});
