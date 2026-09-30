import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('$lib/prisma', () => ({
	prisma: { order: { findMany: mocks.findMany } }
}));

import { getDashboardOrdersPage } from './dashboard-orders';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('getDashboardOrdersPage', () => {
	it('returns the private offer reference needed for an exact reorder without exposing fulfillment data', async () => {
		mocks.findMany.mockResolvedValue([
			{
				id: 'order-1',
				orderNumber: 'FA-1',
				totalAmount: '7550',
				refundedAmount: '0',
				status: 'paid',
				paymentStatus: 'paid',
				paymentReference: 'reference',
				deliveryStatus: 'processing',
				deliveryMethod: 'boosting',
				createdAt: new Date('2026-09-29T00:00:00Z'),
				orderItems: [
					{
						id: 'item-1',
						categoryId: 'category-1',
						productName: 'Premium X followers',
						quantity: 1,
						unitPrice: '7550',
						totalPrice: '7550',
						refundedAmount: '0',
						allocationStatus: 'pending',
						boostTargetUrl: 'https://x.com/fastaccs',
						boostQuantity: 500,
						boostFulfillmentStatus: 'pending',
						boostFulfillment: { offerId: 'offer-1' }
					}
				]
			}
		]);

		const page = await getDashboardOrdersPage({ userId: 'user-1' });

		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: 'user-1' },
				select: expect.objectContaining({
					orderItems: {
						select: expect.objectContaining({
							boostFulfillment: { select: { offerId: true } }
						})
					}
				})
			})
		);
		expect(page.orders[0].orderItems[0]).toMatchObject({
			id: 'item-1',
			boostOfferId: 'offer-1',
			unitPrice: 7550
		});
		expect(page.orders[0].orderItems[0]).not.toHaveProperty('boostFulfillment');
	});
});
