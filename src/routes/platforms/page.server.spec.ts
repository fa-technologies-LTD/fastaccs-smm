import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findPlatforms: vi.fn(),
	groupDemand: vi.fn(),
	groupEngagement: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findMany: mocks.findPlatforms },
		orderItem: { groupBy: mocks.groupDemand },
		account: { groupBy: mocks.groupEngagement }
	}
}));

import { serverCache } from '$lib/helpers/cache';
import { load } from './+page.server';

describe('account catalogue evidence-backed filters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		serverCache.clear();
	});

	it('derives popularity from paid units and engagement from measured available accounts', async () => {
		mocks.findPlatforms.mockResolvedValue([
			{
				id: 'platform-1',
				name: 'Instagram',
				slug: 'instagram',
				description: null,
				metadata: {},
				children: [
					{
						id: 'tier-1',
						name: 'Aged',
						slug: 'aged',
						metadata: { pricing: { base_price: 1500 } },
						sortOrder: 0,
						_count: { accounts: 4 }
					}
				]
			}
		]);
		mocks.groupDemand.mockResolvedValue([{ categoryId: 'tier-1', _sum: { quantity: 12 } }]);
		mocks.groupEngagement.mockResolvedValue([
			{ categoryId: 'tier-1', _count: { _all: 3 }, _avg: { engagementRate: 4.2 } }
		]);

		const result = await (load as CallableFunction)({});

		expect(result.platforms[0]).toMatchObject({
			recent_paid_units: 12,
			high_engagement_accounts: 3,
			average_engagement_rate: 4.2,
			total_accounts: 4
		});
		expect(mocks.groupDemand).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					order: expect.objectContaining({ orderType: 'account', paymentStatus: 'paid' })
				})
			})
		);
		expect(mocks.groupEngagement).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { status: 'available', engagementRate: { gte: 3 } }
			})
		);
	});
});
