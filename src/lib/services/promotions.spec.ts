import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	promotionCode: { findUnique: vi.fn() },
	promotionRedemption: { findFirst: vi.fn() },
	category: { findMany: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import { validatePromotionCode } from './promotions';

const welcome10 = {
	id: 'promotion-1',
	code: 'WELCOME10',
	type: 'PERCENT',
	value: 10,
	currency: 'NGN',
	minOrderValue: 0,
	usageCap: null,
	usageCount: 0,
	singleUsePerUser: true,
	platformIds: [],
	issuedToUserId: null,
	startsAt: null,
	endsAt: null,
	isActive: true,
	createdBy: null,
	createdAt: new Date(),
	updatedAt: new Date()
};

describe('WELCOME10 promotion contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.promotionCode.findUnique.mockResolvedValue(welcome10);
		prismaMock.promotionRedemption.findFirst.mockResolvedValue(null);
	});

	it('takes 10% off without a global cap or platform restriction', async () => {
		const result = await validatePromotionCode({
			code: 'welcome10',
			userId: 'user-1',
			subtotal: 12_500,
			categoryIds: ['any-category']
		});

		expect(result).toMatchObject({
			valid: true,
			discountAmount: 1_250,
			finalTotal: 11_250
		});
		expect(prismaMock.category.findMany).not.toHaveBeenCalled();
	});

	it('remains limited to one redemption per customer', async () => {
		prismaMock.promotionRedemption.findFirst.mockResolvedValue({ id: 'used-1' });

		const result = await validatePromotionCode({
			code: 'WELCOME10',
			userId: 'user-1',
			subtotal: 2_000,
			categoryIds: []
		});

		expect(result.valid).toBe(false);
		expect(result.error).toContain('already been used');
	});
});
