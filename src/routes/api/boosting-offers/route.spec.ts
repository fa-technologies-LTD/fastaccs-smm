import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('$lib/prisma', () => ({
	prisma: { boostCustomerOffer: { findMany: mocks.findMany } }
}));

import { GET } from './+server';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findMany.mockResolvedValue([
		{
			categoryId: 'category-1',
			customerName: 'Stable followers',
			shortPromise: 'Lower drop risk.',
			expectationChips: ['More stable'],
			qualityTier: 'stable',
			displayOrder: 1
		}
	]);
});

describe('public live Boosting offer copy', () => {
	it('returns only explicitly published active customer fields', async () => {
		const setHeaders = vi.fn();
		const response = await GET({ setHeaders } as never);
		const body = await response.json();

		expect(body).toMatchObject({ success: true, data: [{ categoryId: 'category-1' }] });
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					status: 'live',
					category: { categoryType: 'boosting_service', isActive: true }
				},
				select: expect.not.objectContaining({
					routes: true,
					minimumMarginPercent: true,
					maximumSupplierCostNgn: true
				})
			})
		);
		expect(setHeaders).toHaveBeenCalledWith(
			expect.objectContaining({ 'cache-control': expect.stringContaining('s-maxage=300') })
		);
	});
});
