import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	transaction: vi.fn(),
	creditStoreCredit: vi.fn(),
	recordOrderEvent: vi.fn(),
	voidSuper: vi.fn(),
	reconcileSales: vi.fn(),
	voidPending: vi.fn(),
	reverseVested: vi.fn(),
	clawbackMilestones: vi.fn(),
	audit: vi.fn(),
	invalidateStats: vi.fn(),
	heldOrder: vi.fn(),
	creditSpent: vi.fn(),
	verifyPayment: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: { findUnique: vi.fn(), update: vi.fn() },
	orderItem: { update: vi.fn(), updateMany: vi.fn() },
	boostFulfillment: { updateMany: vi.fn() },
	refundRecoveryTask: { upsert: vi.fn() },
	walletTransaction: { aggregate: vi.fn() },
	notification: { create: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		$transaction: mocks.transaction,
		order: { findUnique: mocks.heldOrder },
		walletTransaction: { aggregate: mocks.creditSpent }
	}
}));
vi.mock('$lib/services/payment', () => ({ verifyPayment: mocks.verifyPayment }));
vi.mock('$lib/services/store-credit', () => ({
	creditStoreCredit: mocks.creditStoreCredit,
	SC_CREDIT_REFUND: 'store_credit_refund',
	SC_REDEEM_EARNED: 'store_credit_redemption_earned',
	SC_REDEEM_REFUND: 'store_credit_redemption_refund',
	SC_REDEEM_PROMO: 'store_credit_redemption_promo'
}));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));
vi.mock('$lib/services/affiliate', () => ({
	maybeVoidSuperActivationOnRefund: mocks.voidSuper,
	reconcileAffiliateSales: mocks.reconcileSales
}));
vi.mock('$lib/services/affiliate-vesting', () => ({
	voidUnvestedRewardsForOrder: mocks.voidPending,
	reverseVestedRegularRewardForOrder: mocks.reverseVested
}));
vi.mock('$lib/services/spend-milestones', () => ({
	maybeClawbackSpendMilestones: mocks.clawbackMilestones
}));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/admin-metrics', () => ({
	invalidateAdminStatsCache: mocks.invalidateStats
}));

import { POST } from './+server';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const AFFILIATE_ID = '33333333-3333-4333-8333-333333333333';

function callRefund(customerMessage?: unknown) {
	return POST({
		params: { id: ORDER_ID },
		request: new Request(`https://smm.fastaccs.com/api/orders/${ORDER_ID}/refund`, {
			method: 'POST',
			...(customerMessage === undefined ? {} : { body: JSON.stringify({ customerMessage }) })
		}),
		locals: {
			user: { id: '44444444-4444-4444-8444-444444444444' },
			adminContext: {}
		}
	} as never);
}

function paidOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: ORDER_ID,
		orderNumber: 'ORD-1',
		userId: USER_ID,
		affiliateUserId: AFFILIATE_ID,
		totalAmount: 22_500,
		paymentStatus: 'paid',
		status: 'completed',
		deliveryStatus: 'delivered',
		refundedAmount: 7_500,
		paymentReference: 'ORD_paid',
		orderItems: [
			{ id: 'item-1', totalPrice: 15_000, refundedAmount: 7_500 },
			{ id: 'item-2', totalPrice: 7_500, refundedAmount: 0 }
		],
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
	tx.$queryRaw.mockResolvedValue([]);
	tx.order.findUnique.mockResolvedValue(paidOrder());
	tx.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: 7_500 } });
	tx.order.update.mockResolvedValue({});
	tx.orderItem.update.mockResolvedValue({});
	tx.orderItem.updateMany.mockResolvedValue({ count: 0 });
	tx.boostFulfillment.updateMany.mockResolvedValue({ count: 0 });
	tx.notification.create.mockResolvedValue({ id: 'refund-notice' });
	mocks.creditStoreCredit.mockResolvedValue({});
	mocks.recordOrderEvent.mockResolvedValue(true);
	mocks.voidSuper.mockResolvedValue(undefined);
	mocks.reconcileSales.mockResolvedValue(undefined);
	mocks.voidPending.mockResolvedValue({ voided: 1 });
	mocks.reverseVested.mockResolvedValue({ reversed: 0 });
	mocks.clawbackMilestones.mockResolvedValue(undefined);
	mocks.audit.mockResolvedValue(undefined);
	mocks.heldOrder.mockImplementation(async () => tx.order.findUnique());
	mocks.creditSpent.mockResolvedValue({ _sum: { amount: null } });
	// Monnify's own record: by default the transfer covered the order in full.
	mocks.verifyPayment.mockImplementation(async (reference: string) => ({
		success: true,
		status: 'PAID',
		paymentReference: reference,
		amountPaid: (await tx.order.findUnique()).totalAmount,
		currency: 'NGN',
		metaData: {}
	}));
});

describe('full-order refund integrity', () => {
	it('saves the customer message and refund notification in the money transaction', async () => {
		const response = await callRefund('We could not complete delivery.');
		expect(response.status).toBe(200);
		expect(tx.notification.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				userId: USER_ID,
				orderId: ORDER_ID,
				type: 'store_credit',
				message: expect.stringContaining('We could not complete delivery.')
			})
		});
		expect(mocks.recordOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				description: expect.stringContaining('We could not complete delivery.')
			}),
			tx
		);
	});
	it.each([123, 'x'.repeat(501)])(
		'rejects invalid refund wording before any money mutation',
		async (message) => {
			expect((await callRefund(message)).status).toBe(400);
			expect(mocks.transaction).not.toHaveBeenCalled();
		}
	);
	it('does not issue money just because an unpaid order was labelled completed', async () => {
		tx.order.findUnique.mockResolvedValue(
			paidOrder({ status: 'completed', paymentStatus: 'pending' })
		);
		expect((await callRefund()).status).toBe(409);
		expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
		expect(tx.refundRecoveryTask.upsert).not.toHaveBeenCalled();
	});
	it('returns kobo in the unrefunded remainder rather than flooring it', async () => {
		tx.order.findUnique.mockResolvedValue(paidOrder({ totalAmount: 22500.5 }));
		const response = await callRefund();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ refundedAmount: 15000.5 });
		expect(mocks.creditStoreCredit).toHaveBeenCalledWith(
			tx,
			expect.objectContaining({ amount: 15000.5 })
		);
	});
	it('credits only the unrefunded remainder and then reverses every reward layer', async () => {
		const response = await callRefund();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, refundedAmount: 15_000, orderId: ORDER_ID });
		expect(mocks.creditStoreCredit).toHaveBeenCalledWith(
			tx,
			expect.objectContaining({ userId: USER_ID, amount: 15_000, reference: ORDER_ID })
		);
		expect(tx.order.update).toHaveBeenCalledWith({
			where: { id: ORDER_ID },
			data: expect.objectContaining({
				status: 'refunded',
				paymentStatus: 'refunded',
				deliveryStatus: 'refunded',
				refundedAmount: 22_500
			})
		});
		expect(mocks.voidSuper).toHaveBeenCalledWith({
			userId: USER_ID,
			affiliateUserId: AFFILIATE_ID
		});
		expect(tx.refundRecoveryTask.upsert).toHaveBeenCalledWith({
			where: { eventKey: `refund:order:${ORDER_ID}` },
			update: {},
			create: { orderId: ORDER_ID, eventKey: `refund:order:${ORDER_ID}` }
		});
		expect(mocks.voidPending).toHaveBeenCalledWith(ORDER_ID);
		expect(mocks.reverseVested).toHaveBeenCalledWith(ORDER_ID);
	});

	it('refuses a paid label with no money behind it, even on an ordinary order', async () => {
		// An order marked paid by hand, or a payment Monnify has no record of, must never become store credit.
		mocks.verifyPayment.mockResolvedValue({
			success: false,
			status: 'not_found',
			paymentReference: '',
			amountPaid: 0,
			currency: 'NGN'
		});
		const response = await callRefund();
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining('Only ₦0 of ₦22,500 could be confirmed')
		});
		expect(mocks.verifyPayment).toHaveBeenCalledWith('ORD_paid');
		expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
		expect(tx.order.update).not.toHaveBeenCalled();
	});

	it('confirms an order paid only with store credit from the credit ledger, without Monnify', async () => {
		tx.order.findUnique.mockResolvedValue(paidOrder({ paymentReference: null }));
		mocks.creditSpent.mockResolvedValue({ _sum: { amount: 22_500 } });
		expect((await callRefund()).status).toBe(200);
		expect(mocks.verifyPayment).not.toHaveBeenCalled();
		expect(mocks.creditSpent).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ metadata: { path: ['orderId'], equals: ORDER_ID } })
			})
		);
	});

	it('makes a repeat refund request a no-op with no second credit', async () => {
		tx.order.findUnique.mockResolvedValue(
			paidOrder({
				status: 'refunded',
				paymentStatus: 'refunded',
				deliveryStatus: 'refunded',
				refundedAmount: 22_500
			})
		);

		const response = await callRefund();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, alreadyRefunded: true, refundedAmount: 22_500 });
		expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
		expect(tx.order.update).not.toHaveBeenCalled();
		expect(mocks.voidSuper).not.toHaveBeenCalled();
		expect(tx.notification.create).not.toHaveBeenCalled();
	});

	describe('money held for review', () => {
		const held = () => ({
			...paidOrder(),
			paymentStatus: 'under_review',
			status: 'cancelled',
			deliveryStatus: 'pending',
			totalAmount: 10_500,
			refundedAmount: 0,
			paymentReference: 'ORD_held',
			storeCreditApplied: 0,
			orderItems: [{ id: 'item-1', totalPrice: 10_500, refundedAmount: 0 }]
		});
		const monnify = (overrides: Record<string, unknown> = {}) => ({
			success: true,
			status: 'PAID',
			paymentReference: 'ORD_held',
			transactionReference: 'MNFY|34|1',
			amount: 10_500,
			amountPaid: 10_500,
			currency: 'NGN',
			metaData: { orderId: ORDER_ID },
			...overrides
		});
		beforeEach(() => {
			tx.order.findUnique.mockResolvedValue(held());
			tx.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
		});

		it('refunds it to store credit once Monnify confirms the full amount for this order', async () => {
			mocks.verifyPayment.mockResolvedValue(monnify());
			const response = await callRefund();
			expect(response.status).toBe(200);
			expect(mocks.verifyPayment).toHaveBeenCalledWith('ORD_held');
			expect(mocks.creditStoreCredit).toHaveBeenCalledWith(
				tx,
				expect.objectContaining({ userId: USER_ID, amount: 10_500 })
			);
			expect(tx.order.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: 'refunded', paymentStatus: 'refunded' })
				})
			);
			expect(mocks.recordOrderEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						confirmedReceived: { transfer: 10_500, storeCredit: 0 }
					})
				}),
				tx
			);
		});

		it.each([
			['Monnify has not been paid', monnify({ success: false, status: 'PENDING', amountPaid: 0 })],
			['less than the order total arrived', monnify({ amountPaid: 10_000 })],
			[
				'the payment belongs to another order',
				monnify({ paymentReference: 'ORD_other', metaData: {} })
			],
			['the currency is wrong', monnify({ currency: 'USD' })]
		])('refuses, and credits nothing, when %s', async (_, verified) => {
			mocks.verifyPayment.mockResolvedValue(verified);
			const response = await callRefund();
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ error: expect.stringContaining('Monnify') });
			expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
			expect(tx.order.update).not.toHaveBeenCalled();
		});

		it('counts store credit spent on the order alongside the transfer', async () => {
			tx.order.findUnique.mockResolvedValue({ ...held(), storeCreditApplied: 2_000 });
			mocks.creditSpent.mockResolvedValue({ _sum: { amount: 2_000 } });
			mocks.verifyPayment.mockResolvedValue(monnify({ amountPaid: 8_500 }));
			expect((await callRefund()).status).toBe(200);
			expect(mocks.creditStoreCredit).toHaveBeenCalledWith(
				tx,
				expect.objectContaining({ amount: 10_500 })
			);
		});

		it.each([
			['the request fails', () => mocks.verifyPayment.mockRejectedValue(new Error('network'))],
			[
				'Monnify reports an error',
				() =>
					mocks.verifyPayment.mockResolvedValue(
						monnify({ success: false, status: 'error', amountPaid: 0 })
					)
			]
		])('asks to try again, and credits nothing, when %s', async (_, arrange) => {
			arrange();
			const response = await callRefund();
			expect(response.status).toBe(503);
			expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
			expect(mocks.transaction).toHaveBeenCalled();
		});
	});
});
