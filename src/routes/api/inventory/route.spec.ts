import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findCategories: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findMany: mocks.findCategories }
	}
}));

vi.mock('$lib/services/admin-metrics', () => ({ getInventoryStatsSnapshot: vi.fn() }));
vi.mock('$lib/services/admin-settings', () => ({
	getLowStockPolicyState: vi.fn(),
	getLowStockThresholdSetting: vi.fn()
}));
vi.mock('$lib/services/exact-preview', () => ({
	getExactPreviewProfileUrl: vi.fn(() => null),
	getExactPreviewScreenshotUrl: vi.fn(() => null)
}));
vi.mock('$lib/helpers/cache', () => ({ getCacheHeaders: vi.fn(() => ({})) }));

import { GET } from './+server';

function callInventory(user: unknown = { id: 'admin-1', userType: 'ADMIN' }) {
	return GET({
		url: new URL('https://smm.fastaccs.com/api/inventory?type=batches'),
		locals: { user }
	} as never);
}

describe('inventory admin data', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findCategories.mockResolvedValue([
			{
				id: 'tier-1',
				name: 'Organic X',
				metadata: { pricing: { base_price: 2500 } },
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-08-01T00:00:00.000Z'),
				parent: { name: 'X' },
				accountBatches: [{ createdAt: new Date('2026-08-31T10:30:00.000Z') }],
				accounts: [
					{
						id: 'account-1',
						status: 'available',
						platform: 'X',
						linkUrl: null,
						credentialExtras: null
					}
				]
			}
		]);
	});

	it('requires an admin user', async () => {
		const response = await callInventory(null);
		expect(response.status).toBe(401);
		expect(mocks.findCategories).not.toHaveBeenCalled();
	});

	it('uses the newest completed non-empty batch as the truthful restock time', async () => {
		const response = await callInventory();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.findCategories).toHaveBeenCalledWith(
			expect.objectContaining({
				include: expect.objectContaining({
					accountBatches: expect.objectContaining({
						where: { importStatus: 'completed', totalUnits: { gt: 0 } },
						orderBy: { createdAt: 'desc' },
						take: 1
					})
				})
			})
		);
		expect(body.data[0]).toMatchObject({
			platform_name: 'X',
			tier_name: 'Organic X',
			available_accounts: 1,
			last_restocked_at: '2026-08-31T10:30:00.000Z'
		});
	});
});
