import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	groupDemand: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		category: { findFirst: mocks.findFirst },
		orderItem: { groupBy: mocks.groupDemand }
	}
}));

vi.mock('$lib/services/admin-settings', () => ({
	getLowStockThresholdSetting: vi.fn().mockResolvedValue(10)
}));

import { load } from './+page.server';

const xPlatform = {
	id: 'platform-x',
	name: 'X ',
	slug: 'x',
	description: 'Aged X accounts',
	metadata: {},
	children: [
		{
			id: 'tier-cheap-empty',
			name: 'Cheap',
			slug: 'cheap',
			description: null,
			isActive: true,
			metadata: { pricing: { base_price: 1500 } },
			sortOrder: 0,
			_count: { accounts: 0 }
		},
		{
			id: 'tier-500',
			name: 'Organic 500 Followers ',
			slug: 'organic-500',
			description: null,
			isActive: true,
			metadata: { pricing: { base_price: 2500 } },
			sortOrder: 1,
			_count: { accounts: 4 }
		}
	]
};

const run = (platform: string, search = '') =>
	(load as CallableFunction)({
		params: { platform },
		url: new URL(`https://smm.fastaccs.com/platforms/${platform}${search}`)
	});

describe('platform page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.groupDemand.mockResolvedValue([]);
	});

	it('returns buyer-intent SEO with the cheapest in-stock price and an FAQ', async () => {
		mocks.findFirst.mockResolvedValueOnce(xPlatform);

		const result = await run('x');

		expect(result.seo.title).toBe('Buy X (Twitter) Accounts — from ₦2,500 | FastAccs');
		expect(result.faq.length).toBeGreaterThan(0);
		expect(result.faq[0].question).toContain('X (Twitter)');
	});

	it('301-redirects other casings to the canonical slug, keeping the query string', async () => {
		mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ slug: 'Instagram' });

		await expect(run('instagram', '?utm_source=nairaland')).rejects.toMatchObject({
			status: 301,
			location: '/platforms/Instagram?utm_source=nairaland'
		});
		expect(mocks.findFirst).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					slug: { equals: 'instagram', mode: 'insensitive' }
				})
			})
		);
	});

	it('still 404s when no platform matches in any casing', async () => {
		mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

		await expect(run('myspace')).rejects.toMatchObject({ status: 404 });
	});
});
