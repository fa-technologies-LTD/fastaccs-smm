import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	order: { aggregate: vi.fn() },
	promotionCode: {
		findFirst: vi.fn(),
		updateMany: vi.fn(),
		create: vi.fn()
	},
	promotionRedemption: { count: vi.fn() },
	notification: { create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('$lib/helpers/order-revenue.server', () => ({
	buildRevenueOrderWhere: vi.fn(() => ({})),
	toNetSales: vi.fn((total: unknown, refunded: unknown) => Number(total || 0) - Number(refunded || 0))
}));

import { maybeGrantSpendMilestones } from './spend-milestones';

describe('spend milestone promo requalification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.order.aggregate.mockResolvedValue({
			_sum: { totalAmount: 9_000, refundedAmount: 0 }
		});
		prismaMock.notification.create.mockResolvedValue({});
	});

	it('restores the same unused promo after corrected paid spend reaches ₦8,000 again', async () => {
		prismaMock.promotionCode.findFirst.mockResolvedValue({
			id: 'promo-1',
			code: 'SPEND8K-ABC123',
			isActive: false,
			usageCount: 0
		});
		prismaMock.promotionRedemption.count.mockResolvedValue(0);
		prismaMock.promotionCode.updateMany.mockResolvedValue({ count: 1 });

		await maybeGrantSpendMilestones('11111111-1111-4111-8111-111111111111');

		expect(prismaMock.promotionCode.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: 'promo-1',
					isActive: false,
					usageCount: 0,
					redemptions: { none: {} }
				}),
				data: expect.objectContaining({ isActive: true, endsAt: expect.any(Date) })
			})
		);
		expect(prismaMock.promotionCode.create).not.toHaveBeenCalled();
		expect(prismaMock.notification.create).toHaveBeenCalledOnce();
	});

	it('never restores a code that has a redemption record', async () => {
		prismaMock.promotionCode.findFirst.mockResolvedValue({
			id: 'promo-1',
			code: 'SPEND8K-ABC123',
			isActive: false,
			usageCount: 0
		});
		prismaMock.promotionRedemption.count.mockResolvedValue(1);

		await maybeGrantSpendMilestones('11111111-1111-4111-8111-111111111111');

		expect(prismaMock.promotionCode.updateMany).not.toHaveBeenCalled();
		expect(prismaMock.promotionCode.create).not.toHaveBeenCalled();
	});
});
