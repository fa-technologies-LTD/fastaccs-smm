import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	isCheckoutEnabled: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findUnique
		}
	}
}));

vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: mocks.isCheckoutEnabled,
	getMinimumOrderValueSetting: vi.fn()
}));

import { POST } from './+server';

const verifiedBuyer = {
	id: 'buyer-1',
	email: 'buyer@example.com',
	phone: null,
	fullName: 'Buyer',
	emailVerified: true,
	userType: 'REGISTERED'
};

function buildRequest(checkoutKey: string, useStoreCredit = false): Request {
	return new Request('https://smm.fastaccs.com/api/orders', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			checkoutKey,
			items: [{ categoryId: 'tier-1', quantity: 1 }],
			paymentMethod: 'monnify',
			useStoreCredit
		})
	});
}

describe('checkout session ownership and resume behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isCheckoutEnabled.mockResolvedValue(true);
	});

	it('rejects a checkout key that belongs to another user', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-other-user',
			userId: 'buyer-2',
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentCheckoutUrl: 'https://monnify.example/checkout',
			paymentExpiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
			deliveryMethod: 'email'
		});

		const response = await POST({
			request: buildRequest('checkout-key-owned-by-another-user'),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			success: false,
			error: 'Checkout session conflict.'
		});
	});

	it('resumes the buyer’s still-active checkout instead of creating a duplicate order', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-existing',
			userId: verifiedBuyer.id,
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentCheckoutUrl: 'https://monnify.example/checkout',
			paymentReference: 'ORD_EXISTING',
			paymentExpiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
			deliveryMethod: 'email'
		});

		const response = await POST({
			request: buildRequest('checkout-key-owned-by-current-user'),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			resumed: true,
			orderId: 'order-existing',
			checkoutUrl: 'https://monnify.example/checkout',
			paymentReference: 'ORD_EXISTING'
		});
	});

	it('does not resume a gateway checkout after the buyer switches to store credit', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-existing',
			userId: verifiedBuyer.id,
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentMethod: 'monnify',
			storeCreditApplied: 0,
			paymentCheckoutUrl: 'https://monnify.example/checkout',
			paymentReference: 'ORD_EXISTING',
			paymentExpiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
			deliveryMethod: 'email'
		});

		const response = await POST({
			request: buildRequest('checkout-key-payment-intent-changed', true),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			success: false,
			code: 'CHECKOUT_INTENT_CHANGED'
		});
	});

	it('resumes a paid store-credit checkout after the original response was lost', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-paid',
			userId: verifiedBuyer.id,
			status: 'paid',
			paymentStatus: 'paid',
			paymentMethod: 'store_credit',
			paymentCheckoutUrl: null,
			paymentReference: null,
			paymentExpiresAt: null,
			updatedAt: new Date(),
			deliveryMethod: 'email',
			orderType: 'phone'
		});

		const response = await POST({
			request: buildRequest('checkout-key-paid-response-was-lost', true),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/orders')
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			resumed: true,
			orderId: 'order-paid',
			paidWithStoreCredit: true,
			deliveryMode: 'auto_sms'
		});
		expect(body.redirectUrl).toContain('/checkout/verify?orderId=order-paid&method=store_credit');
	});
});
