import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	readAffiliateReferralCookie: vi.fn(),
	validateAffiliateCode: vi.fn(),
	clearAffiliateReferralCookie: vi.fn(),
	getStoreCreditBuckets: vi.fn(),
	getPromoCaps: vi.fn(),
	getFirstOrderOffer: vi.fn(),
	findPromotion: vi.fn()
}));

vi.mock('$lib/services/affiliate', () => ({
	readAffiliateReferralCookie: mocks.readAffiliateReferralCookie,
	validateAffiliateCode: mocks.validateAffiliateCode,
	clearAffiliateReferralCookie: mocks.clearAffiliateReferralCookie
}));
vi.mock('$lib/services/store-credit', () => ({
	getStoreCreditBuckets: mocks.getStoreCreditBuckets
}));
vi.mock('$lib/services/promo-campaigns', () => ({ getPromoCaps: mocks.getPromoCaps }));
vi.mock('$lib/services/promotions', () => ({ getFirstOrderOffer: mocks.getFirstOrderOffer }));
vi.mock('$lib/prisma', () => ({
	prisma: { promotionCode: { findFirst: mocks.findPromotion } }
}));

import { load } from './+page.server';

describe('checkout affiliate cookie', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getStoreCreditBuckets.mockResolvedValue({
			earnedAvailable: 0,
			refundAvailable: 0,
			promoAvailable: 0,
			promo: [],
			totalAvailable: 0
		});
		mocks.findPromotion.mockResolvedValue(null);
		mocks.getFirstOrderOffer.mockResolvedValue(null);
	});

	it('keeps a valid referral available to checkout', async () => {
		mocks.readAffiliateReferralCookie.mockReturnValue('LIVE123');
		mocks.validateAffiliateCode.mockResolvedValue({
			valid: true,
			userId: 'affiliate-user',
			affiliateCode: 'LIVE123'
		});

		const result = await load({
			cookies: {},
			locals: { user: null },
			url: new URL('https://smm.fastaccs.com/checkout')
		} as never);

		expect(result).toMatchObject({ affiliateRef: 'LIVE123' });
		expect(mocks.clearAffiliateReferralCookie).not.toHaveBeenCalled();
	});

	it('drops and clears an invalid referral before checkout', async () => {
		const cookies = {};
		mocks.readAffiliateReferralCookie.mockReturnValue('STALE123');
		mocks.validateAffiliateCode.mockResolvedValue({
			valid: false,
			error: 'Affiliate code is invalid.'
		});

		const result = await load({
			cookies,
			locals: { user: null },
			url: new URL('https://smm.fastaccs.com/checkout')
		} as never);

		expect(result).toMatchObject({ affiliateRef: null });
		expect(mocks.clearAffiliateReferralCookie).toHaveBeenCalledWith(cookies, true);
	});

	it('drops and clears a self-referral without blocking checkout', async () => {
		const cookies = {};
		mocks.readAffiliateReferralCookie.mockReturnValue('MINE123');
		mocks.validateAffiliateCode.mockResolvedValue({
			valid: true,
			userId: 'buyer-user',
			affiliateCode: 'MINE123'
		});

		const result = await load({
			cookies,
			locals: { user: { id: 'buyer-user' } },
			url: new URL('https://smm.fastaccs.com/checkout')
		} as never);

		expect(result).toMatchObject({ affiliateRef: null });
		expect(mocks.clearAffiliateReferralCookie).toHaveBeenCalledWith(cookies, true);
	});
});
