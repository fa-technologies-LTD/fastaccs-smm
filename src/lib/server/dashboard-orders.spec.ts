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
							boostFulfillment: {
								select: expect.objectContaining({
									offerId: true,
									status: true,
									lastSafeErrorCategory: true
								})
							}
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
	it('says in plain words why Monnify refused a transfer, without exposing the event', async () => {
		const unpaid = {
			id: 'order-2',
			orderNumber: 'FA-2',
			totalAmount: '10500',
			refundedAmount: '0',
			status: 'pending_payment',
			paymentStatus: 'pending',
			orderItems: []
		};
		mocks.findMany.mockResolvedValue([
			{
				...unpaid,
				events: [
					{ metadata: { reason: 'UNDER_PAYMENT', expectedAmount: 10500, amountSent: 10000 } }
				]
			},
			{ ...unpaid, id: 'order-3', events: [] }
		]);
		const page = await getDashboardOrdersPage({ userId: 'user-1' });
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: expect.objectContaining({
					events: expect.objectContaining({ where: { type: 'payment_transfer_declined' }, take: 1 })
				})
			})
		);
		expect(page.orders[0].paymentNotice).toBe(
			'Your transfer of ₦10,000 wasn’t accepted: this order needs exactly ₦10,500. You can still pay with Resume payment.'
		);
		expect(page.orders[1].paymentNotice).toBeNull();
		expect(page.orders[0]).not.toHaveProperty('events');
	});
	it('projects a held delivery truthfully without exposing the supplier record', async () => {
		mocks.findMany.mockResolvedValue([
			{
				id: 'held',
				status: 'completed',
				paymentStatus: 'paid',
				deliveryStatus: 'delivered',
				totalAmount: '850',
				refundedAmount: '0',
				orderItems: [
					{
						id: 'item',
						boostTargetUrl: 'https://instagram.com/example',
						boostQuantity: 500,
						boostFulfillmentStatus: 'completed',
						unitPrice: '850',
						totalPrice: '850',
						refundedAmount: '0',
						boostFulfillment: {
							offerId: 'offer',
							status: 'manual_review',
							lastSafeErrorCategory: 'provider_cancelled',
							remains: 500
						}
					}
				]
			}
		]);
		const result = await getDashboardOrdersPage({ userId: 'buyer' });
		expect(result.orders[0].orderItems[0].boostProgress).toMatchObject({
			status: 'under_review',
			reportedDelivered: null
		});
		expect(result.orders[0].orderItems[0]).not.toHaveProperty('boostFulfillment');
		expect(JSON.stringify(result)).not.toContain('provider_cancelled');
	});
});
