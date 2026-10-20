import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	promotionCode: { findUnique: vi.fn() },
	promotionRedemption: { findFirst: vi.fn() },
	category: { findMany: vi.fn() },
	order: { findFirst: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import { getFirstOrderOffer, validatePromotionCode } from './promotions';

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
		prismaMock.order.findFirst.mockResolvedValue(null);
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

	it('only works on the customer’s first account order', async () => {
		prismaMock.order.findFirst.mockResolvedValue({ id: 'earlier-account-order' });

		const result = await validatePromotionCode({
			code: 'WELCOME10',
			userId: 'user-1',
			subtotal: 5_000,
			categoryIds: []
		});

		expect(result).toMatchObject({ valid: false, discountAmount: 0, finalTotal: 5_000 });
		expect(result.error).toBe('WELCOME10 is for your first account order only.');
		expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
			where: {
				AND: [expect.anything(), { userId: 'user-1', orderType: 'account' }]
			},
			select: { id: true }
		});
	});

	it('needs a signed-in customer to check it is their first order', async () => {
		const result = await validatePromotionCode({
			code: 'WELCOME10',
			userId: null,
			subtotal: 5_000,
			categoryIds: []
		});
		expect(result.valid).toBe(false);
	});
});

describe('first-order offer shown at checkout and on the dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.promotionCode.findUnique.mockResolvedValue(welcome10);
		prismaMock.promotionRedemption.findFirst.mockResolvedValue(null);
		prismaMock.order.findFirst.mockResolvedValue(null);
	});

	it('offers WELCOME10 to a customer with no account order yet', async () => {
		expect(await getFirstOrderOffer('user-1')).toEqual({
			code: 'WELCOME10',
			type: 'PERCENT',
			value: 10,
			minOrderValue: 0,
			label: '10% off your first account order'
		});
	});

	it('offers nothing after a first account order, after using it, or when the code is off', async () => {
		prismaMock.order.findFirst.mockResolvedValueOnce({ id: 'earlier' });
		expect(await getFirstOrderOffer('user-1')).toBeNull();
		prismaMock.promotionRedemption.findFirst.mockResolvedValueOnce({ id: 'used' });
		expect(await getFirstOrderOffer('user-1')).toBeNull();
		prismaMock.promotionCode.findUnique.mockResolvedValueOnce({ ...welcome10, isActive: false });
		expect(await getFirstOrderOffer('user-1')).toBeNull();
		expect(await getFirstOrderOffer(null)).toBeNull();
	});
});
