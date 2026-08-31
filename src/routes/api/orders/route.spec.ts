import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOrder: vi.fn(),
	findCategories: vi.fn(),
	groupAccounts: vi.fn(),
	createTransaction: vi.fn(),
	initializeTransaction: vi.fn(),
	releaseOrderReservations: vi.fn(),
	reserveStandardAccountsForOrder: vi.fn(),
	resolveAffiliatePolicyForOrder: vi.fn(),
	resolveOrderAffiliateAttribution: vi.fn(),
	getAffiliateDiscountForOrder: vi.fn(),
	getAffiliateConfig: vi.fn(),
	validateAffiliateCode: vi.fn(),
	validatePromotionCode: vi.fn(),
	getStoreCreditBuckets: vi.fn(),
	computeOrderRedemption: vi.fn(),
	redeemStoreCreditForOrder: vi.fn(),
	logOrderStatusTransition: vi.fn(),
	settleFailedPayment: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findOrder,
			update: vi.fn()
		},
		category: {
			findMany: mocks.findCategories
		},
		account: {
			groupBy: mocks.groupAccounts
		},
		$transaction: mocks.createTransaction
	}
}));

vi.mock('$lib/services/fulfillment', () => ({ fulfillOrder: vi.fn() }));
vi.mock('$lib/services/monnify', () => ({
	initializeTransaction: mocks.initializeTransaction
}));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: vi.fn() }));
vi.mock('$lib/services/promotions', () => ({ validatePromotionCode: mocks.validatePromotionCode }));
vi.mock('$lib/services/affiliate', () => ({
	getAffiliateDiscountForOrder: mocks.getAffiliateDiscountForOrder,
	getAffiliateConfig: mocks.getAffiliateConfig,
	maybeSendAffiliateUnlockInvite: vi.fn(),
	recordAffiliateStoreCreditForOrder: vi.fn(),
	resolveAffiliatePolicyForOrder: mocks.resolveAffiliatePolicyForOrder,
	resolveOrderAffiliateAttribution: mocks.resolveOrderAffiliateAttribution,
	validateAffiliateCode: mocks.validateAffiliateCode
}));
vi.mock('$lib/services/admin-settings', () => ({
	getMinimumOrderValueSetting: vi.fn(async () => 0),
	isCheckoutEnabledSetting: vi.fn(async () => true)
}));
vi.mock('$lib/services/admin-revenue-visibility', () => ({
	canViewRevenue: vi.fn(() => false),
	redactOrderFinancials: vi.fn((order) => order)
}));
vi.mock('$lib/services/exact-preview', () => ({
	attachExactPreviewSelectionsToOrder: vi.fn(),
	releaseExpiredExactPreviewReservations: vi.fn()
}));
vi.mock('$lib/services/order-reservations', () => ({
	releaseExpiredOrderReservations: vi.fn(),
	releaseOrderReservations: mocks.releaseOrderReservations,
	reserveStandardAccountsForOrder: mocks.reserveStandardAccountsForOrder
}));
vi.mock('$lib/services/store-credit', () => ({
	getStoreCreditBuckets: mocks.getStoreCreditBuckets,
	computeOrderRedemption: mocks.computeOrderRedemption,
	redeemStoreCreditForOrder: mocks.redeemStoreCreditForOrder,
	reverseStoreCreditRedemption: vi.fn()
}));
vi.mock('$lib/services/order-audit', () => ({
	logOrderStatusTransition: mocks.logOrderStatusTransition
}));
vi.mock('$lib/services/payment-settlement', () => ({
	recoverPaidOrder: vi.fn(),
	settleFailedPayment: mocks.settleFailedPayment
}));
vi.mock('$lib/helpers/payment-expiry.server', () => ({
	getPendingPaymentExpiresAt: vi.fn(() => new Date('2026-06-06T19:40:00.000Z')),
	getPaymentReservationExpiresAt: vi.fn(() => new Date('2026-06-06T19:45:00.000Z'))
}));

import { POST } from './+server';

const user = {
	id: 'user-123',
	userType: 'CUSTOMER',
	emailVerified: true,
	email: 'buyer@example.com',
	phone: null,
	fullName: 'Buyer'
};

function orderRequest(
	checkoutKey = 'checkout_key_1234567890',
	currency?: string,
	promotionCode?: string,
	useStoreCredit = false,
	affiliateCode?: string
) {
	return new Request('https://smm.fastaccs.com/api/orders', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-request-id': 'test-trace' },
		body: JSON.stringify({
			items: [{ categoryId: 'tier-123', quantity: 1 }],
			paymentMethod: 'monnify',
			checkoutKey,
			currency,
			promotionCode,
			useStoreCredit,
			affiliateCode
		})
	});
}

async function callCreateOrder(checkoutKey?: string, currency?: string, promotionCode?: string) {
	return POST({
		request: orderRequest(checkoutKey, currency, promotionCode),
		locals: { user },
		url: new URL('https://smm.fastaccs.com/api/orders')
	} as never);
}

describe('approved invariant: emergency checkout order control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.getAffiliateConfig.mockResolvedValue({
			superAffiliateEnabled: true,
			superActivationSpendThreshold: 3_500,
			superActivationOrderThreshold: 3,
			superActivationReward: 700,
			superTier1Count: 10,
			superTier1Amount: 3_000,
			superTier2Count: 20,
			superTier2Amount: 8_000,
			superTier3Count: 30,
			superTier3Amount: 15_000
		});
		mocks.resolveAffiliatePolicyForOrder.mockImplementation(
			({ programId, liveIsSuperAffiliate, liveConfig }) => ({
				version: 3,
				programId,
				programType: liveIsSuperAffiliate ? 'super' : 'regular',
				...(liveIsSuperAffiliate
					? {
							superTerms: {
								enabled: liveConfig.superAffiliateEnabled,
								activationSpendThreshold: liveConfig.superActivationSpendThreshold,
								activationOrderThreshold: liveConfig.superActivationOrderThreshold,
								activationReward: liveConfig.superActivationReward,
								monthlyTiers: [
									{ count: liveConfig.superTier1Count, amount: liveConfig.superTier1Amount },
									{ count: liveConfig.superTier2Count, amount: liveConfig.superTier2Amount },
									{ count: liveConfig.superTier3Count, amount: liveConfig.superTier3Amount }
								]
							}
						}
					: {})
			})
		);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('blocks a new order before pricing, reservation, or provider initialization', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		mocks.findOrder.mockResolvedValue(null);

		const response = await callCreateOrder();
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body).toMatchObject({
			success: false,
			code: 'CHECKOUT_TEMPORARILY_DISABLED',
			traceId: 'test-trace'
		});
		expect(mocks.findCategories).not.toHaveBeenCalled();
		expect(mocks.createTransaction).not.toHaveBeenCalled();
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.releaseOrderReservations).not.toHaveBeenCalled();
	});

	it('still resumes an active hosted checkout while new checkout is disabled', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'true');
		mocks.findOrder.mockResolvedValue({
			id: 'order-123',
			userId: user.id,
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentReference: 'ORD_EXISTING',
			paymentCheckoutUrl: 'https://checkout.monnify.test/existing',
			paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
			totalAmount: 2500,
			currency: 'NGN',
			deliveryMethod: 'email'
		});

		const response = await callCreateOrder();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			resumed: true,
			orderId: 'order-123',
			checkoutUrl: 'https://checkout.monnify.test/existing',
			traceId: 'test-trace'
		});
		expect(mocks.findCategories).not.toHaveBeenCalled();
		expect(mocks.createTransaction).not.toHaveBeenCalled();
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});

	it('rejects unsupported currency before pricing, reservation, or provider initialization', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(null);

		const response = await callCreateOrder(undefined, 'USD');
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			success: false,
			error: 'This checkout currency is not supported. Please refresh your cart and try again.',
			traceId: 'test-trace'
		});
		expect(mocks.findCategories).not.toHaveBeenCalled();
		expect(mocks.createTransaction).not.toHaveBeenCalled();
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});

	it('rejects a zero final total before creating an order, reserving stock, or contacting Monnify', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(null);
		mocks.findCategories.mockResolvedValue([
			{
				id: 'tier-123',
				name: '100 Followers',
				parent: { name: 'Instagram' },
				metadata: { pricing: { base_price: 2500 }, delivery_mode: 'instant_auto' }
			}
		]);
		mocks.groupAccounts.mockResolvedValue([{ categoryId: 'tier-123', _count: { _all: 1 } }]);
		mocks.validateAffiliateCode.mockResolvedValue({ valid: false });
		mocks.resolveOrderAffiliateAttribution.mockResolvedValue({
			affiliateCode: null,
			affiliateUserId: null,
			error: null
		});
		mocks.validatePromotionCode.mockResolvedValue({
			valid: true,
			promotion: { id: 'promotion-123', code: 'FREEORDER' },
			discountAmount: 2500,
			finalTotal: 0
		});

		const response = await callCreateOrder(undefined, 'NGN', 'FREEORDER');
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			success: false,
			error: 'Payment amount is invalid. Please refresh your cart and try again.',
			traceId: 'test-trace'
		});
		expect(mocks.createTransaction).not.toHaveBeenCalled();
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.releaseOrderReservations).not.toHaveBeenCalled();
	});

	it('commits a fully credit-paid Numbers order, wallet debit, and pending rental before responding', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(null);
		mocks.findCategories.mockResolvedValue([
			{
				id: 'tier-123',
				name: 'WhatsApp — USA',
				categoryType: 'tier',
				parent: { name: 'Numbers' },
				metadata: {
					delivery_mode: 'auto_sms',
					hub_service_id: 1,
					hub_service_name: 'WhatsApp',
					hub_country_id: 187,
					hub_country_name: 'United States',
					hub_country_code: 'US',
					hub_expected_cost_cents: 195,
					hub_available_count: 1,
					pricing: { base_price: 5800 }
				}
			}
		]);
		mocks.getStoreCreditBuckets.mockResolvedValue({ refundAvailable: 5800, earnedAvailable: 0 });
		mocks.computeOrderRedemption.mockReturnValue({
			refundApplied: 5800,
			earnedApplied: 0,
			totalApplied: 5800
		});

		const phoneRentalCreate = vi.fn().mockResolvedValue({ id: 'rental-1' });
		const orderCreate = vi.fn().mockResolvedValue({
			id: 'order-credit-phone',
			orderNumber: 'ORD-CREDIT-PHONE',
			status: 'paid',
			paymentStatus: 'paid',
			totalAmount: 5800,
			currency: 'NGN',
			orderItems: []
		});
		mocks.createTransaction.mockImplementation(async (callback) =>
			callback({
				order: { create: orderCreate },
				phoneRental: { create: phoneRentalCreate },
				orderEvent: { create: vi.fn().mockResolvedValue({}) }
			})
		);

		const response = await POST({
			request: orderRequest('checkout_key_credit_phone', 'NGN', undefined, true, 'STALEAFF'),
			locals: { user },
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			orderId: 'order-credit-phone',
			paidWithStoreCredit: true,
			deliveryMode: 'auto_sms'
		});
		expect(body.redirectUrl).toContain(
			'/checkout/verify?orderId=order-credit-phone&method=store_credit'
		);
		expect(orderCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'paid',
					paymentStatus: 'paid',
					paymentMethod: 'store_credit',
					deliveryStatus: 'processing',
					orderType: 'phone',
					affiliateCode: null,
					affiliateUserId: null
				})
			})
		);
		expect(phoneRentalCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({
				serviceId: 1,
				serviceName: 'WhatsApp',
				countryId: 187,
				countryName: 'United States',
				saleAmountNgn: 5800,
				status: 'pending'
			})
		});
		expect(mocks.redeemStoreCreditForOrder).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				userId: user.id,
				orderId: 'order-credit-phone',
				redemption: expect.objectContaining({ totalApplied: 5800 })
			})
		);
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});

	it('snapshots regular-versus-Super treatment on an attributed account order', async () => {
		vi.stubEnv('CHECKOUT_DISABLED', 'false');
		mocks.findOrder.mockResolvedValue(null);
		mocks.findCategories.mockResolvedValue([
			{
				id: 'tier-123',
				name: 'Instagram Account',
				categoryType: 'tier',
				parent: { name: 'Instagram' },
				metadata: { pricing: { base_price: 10_000 }, delivery_mode: 'instant_auto' }
			}
		]);
		mocks.groupAccounts.mockResolvedValue([{ categoryId: 'tier-123', _count: { _all: 1 } }]);
		mocks.resolveOrderAffiliateAttribution.mockResolvedValue({
			affiliateCode: 'SUPER1',
			affiliateUserId: '11111111-1111-4111-8111-111111111111',
			affiliateProgramId: '22222222-2222-4222-8222-222222222222',
			source: 'locked'
		});
		mocks.getAffiliateDiscountForOrder.mockResolvedValue({
			discountAmount: 500,
			maxRewardedOrders: 2
		});
		mocks.initializeTransaction.mockResolvedValue({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/new',
			transactionReference: 'TX-1'
		});

		const orderCreate = vi.fn().mockResolvedValue({
			id: 'order-affiliate',
			orderNumber: 'ORD-AFFILIATE',
			status: 'pending',
			paymentStatus: 'pending',
			totalAmount: 9_500,
			currency: 'NGN',
			orderItems: []
		});
		const tx = {
			$queryRaw: vi.fn().mockResolvedValue([]),
			order: { count: vi.fn().mockResolvedValue(0), create: orderCreate },
			affiliateProgram: {
				findFirst: vi.fn().mockResolvedValue({
					id: '22222222-2222-4222-8222-222222222222',
					isSuperAffiliate: true
				})
			},
			orderEvent: { create: vi.fn().mockResolvedValue({}) }
		};
		mocks.createTransaction.mockImplementation(async (callback) => callback(tx));

		const request = new Request('https://smm.fastaccs.com/api/orders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: [{ categoryId: 'tier-123', quantity: 1 }],
				paymentMethod: 'monnify',
				checkoutKey: 'checkout_key_affiliate_snapshot',
				affiliateCode: 'SUPER1'
			})
		});
		const response = await POST({
			request,
			locals: { user },
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);

		expect(response.status).toBe(200);
		expect(tx.$queryRaw).toHaveBeenCalled();
		expect(orderCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					affiliateCode: 'SUPER1',
					affiliateUserId: '11111111-1111-4111-8111-111111111111',
					analyticsMetadata: expect.objectContaining({
						affiliatePolicy: expect.objectContaining({
							version: 3,
							programId: '22222222-2222-4222-8222-222222222222',
							programType: 'super',
							superTerms: {
								enabled: true,
								activationSpendThreshold: 3_500,
								activationOrderThreshold: 3,
								activationReward: 700,
								monthlyTiers: [
									{ count: 10, amount: 3_000 },
									{ count: 20, amount: 8_000 },
									{ count: 30, amount: 15_000 }
								]
							}
						})
					})
				})
			})
		);
	});
});
