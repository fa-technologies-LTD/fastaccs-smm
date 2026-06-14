import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	initializeTransaction: vi.fn(),
	isCheckoutEnabled: vi.fn(),
	extendReservations: vi.fn(),
	releaseReservations: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findUnique: mocks.findUnique,
			update: mocks.update
		}
	}
}));

vi.mock('$lib/services/monnify', () => ({
	initializeTransaction: mocks.initializeTransaction
}));

vi.mock('$lib/services/admin-settings', () => ({
	isCheckoutEnabledSetting: mocks.isCheckoutEnabled
}));

vi.mock('$lib/services/order-reservations', () => ({
	extendOrderReservations: mocks.extendReservations,
	releaseOrderReservations: mocks.releaseReservations
}));

import { POST } from './initialize/+server';

const verifiedBuyer = {
	id: 'buyer-1',
	email: 'buyer@example.com',
	fullName: 'Buyer',
	emailVerified: true,
	userType: 'REGISTERED'
};

function buildRequest(orderId = 'order-1'): Request {
	return new Request('https://smm.fastaccs.com/api/payments/initialize', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ orderId })
	});
}

describe('payment initialization boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isCheckoutEnabled.mockResolvedValue(true);
	});

	it('never initializes payment for an unverified buyer', async () => {
		const response = await POST({
			request: buildRequest(),
			locals: {
				user: { ...verifiedBuyer, emailVerified: false },
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/payments/initialize')
		} as never);

		expect(response.status).toBe(403);
		expect(mocks.findUnique).not.toHaveBeenCalled();
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});

	it('never initializes payment for an order owned by another user', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-1',
			userId: 'buyer-2',
			status: 'pending',
			paymentStatus: 'pending',
			paymentCheckoutUrl: null,
			paymentExpiresAt: new Date(Date.now() + 60_000)
		});

		const response = await POST({
			request: buildRequest(),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/payments/initialize')
		} as never);

		expect(response.status).toBe(403);
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
	});

	it('resumes an active gateway checkout without creating another transaction', async () => {
		mocks.findUnique.mockResolvedValue({
			id: 'order-1',
			userId: verifiedBuyer.id,
			status: 'pending_payment',
			paymentStatus: 'pending',
			paymentCheckoutUrl: 'https://monnify.example/checkout',
			paymentReference: 'ORD_EXISTING',
			paymentExpiresAt: new Date(Date.now() + 60_000)
		});

		const response = await POST({
			request: buildRequest(),
			locals: {
				user: verifiedBuyer,
				session: null,
				adminContext: null
			},
			url: new URL('https://smm.fastaccs.com/api/payments/initialize')
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			resumed: true,
			checkoutUrl: 'https://monnify.example/checkout',
			paymentReference: 'ORD_EXISTING'
		});
		expect(mocks.initializeTransaction).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
