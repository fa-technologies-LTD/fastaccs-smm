import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	moneyReceived: vi.fn(),
	transaction: vi.fn(),
	creditStoreCredit: vi.fn(),
	recordOrderEvent: vi.fn(),
	voidSuper: vi.fn(),
	reconcileSales: vi.fn(),
	reconcileRegular: vi.fn(),
	voidPending: vi.fn(),
	reverseVested: vi.fn(),
	clawbackMilestones: vi.fn(),
	audit: vi.fn(),
	invalidateStats: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	account: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
	order: { update: vi.fn() },
	orderItem: { update: vi.fn() },
	refundRecoveryTask: { upsert: vi.fn() },
	walletTransaction: { findUnique: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/server/order-money-received', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/order-money-received')>()),
	confirmMoneyReceived: mocks.moneyReceived
}));
vi.mock('$lib/services/store-credit', () => ({
	creditStoreCredit: mocks.creditStoreCredit,
	SC_CREDIT_REFUND: 'store_credit_refund'
}));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));
vi.mock('$lib/services/affiliate', () => ({
	maybeVoidSuperActivationOnRefund: mocks.voidSuper,
	reconcileAffiliateSales: mocks.reconcileSales
}));
vi.mock('$lib/services/affiliate-vesting', () => ({
	voidUnvestedRewardsForOrder: mocks.voidPending,
	reverseVestedRegularRewardForOrder: mocks.reverseVested,
	reconcileRegularRewardForOrder: mocks.reconcileRegular
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
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const AFFILIATE_ID = '44444444-4444-4444-8444-444444444444';

function callRefundAccount() {
	return POST({
		params: { id: ORDER_ID },
		request: new Request('https://smm.fastaccs.com/api/orders/refund-account', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ accountId: ACCOUNT_ID, reason: 'Login failed' })
		}),
		locals: {
			user: { id: '55555555-5555-4555-8555-555555555555' },
			adminContext: {}
		}
	} as never);
}

function accountRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: ACCOUNT_ID,
		status: 'delivered',
		username: 'buyer-account',
		deliveryNotes: null,
		orderItem: {
			id: 'item-1',
			unitPrice: 7_500,
			totalPrice: 22_500,
			quantity: 3,
			refundedAmount: 0,
			order: {
				id: ORDER_ID,
				orderNumber: 'ORD-1',
				userId: USER_ID,
				affiliateUserId: AFFILIATE_ID,
				status: 'completed',
				paymentStatus: 'paid',
				deliveryStatus: 'delivered',
				subtotal: 22_500,
				totalAmount: 22_500,
				refundedAmount: 0,
				orderItems: [{ id: 'item-1', totalPrice: 22_500, refundedAmount: 0 }]
			}
		},
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
	tx.account.findUnique.mockResolvedValue(accountRecord());
	tx.account.count.mockResolvedValue(2);
	tx.account.update.mockResolvedValue({});
	tx.order.update.mockResolvedValue({});
	tx.orderItem.update.mockResolvedValue({});
	tx.walletTransaction.findUnique.mockResolvedValue(null);
	mocks.creditStoreCredit.mockResolvedValue({});
	mocks.recordOrderEvent.mockResolvedValue(true);
	mocks.voidSuper.mockResolvedValue(undefined);
	mocks.reconcileSales.mockResolvedValue(undefined);
	mocks.reconcileRegular.mockResolvedValue(undefined);
	mocks.voidPending.mockResolvedValue({ voided: 0 });
	mocks.reverseVested.mockResolvedValue({ reversed: 0 });
	mocks.clawbackMilestones.mockResolvedValue(undefined);
	mocks.audit.mockResolvedValue(undefined);
	mocks.moneyReceived.mockResolvedValue({ status: 'confirmed', transfer: 0, storeCredit: 0 });
});

describe('per-account refund integrity', () => {
	it.each([
		[{ status: 'short', transfer: 0, storeCredit: 0, total: 10_000 }, 409, /Only ₦0 of ₦10,000/],
		[{ status: 'unavailable' }, 503, /could not be reached/]
	])(
		'pays nothing when the money behind the order is not confirmed (%o)',
		async (money, code, why) => {
			mocks.moneyReceived.mockResolvedValue(money);
			const response = await callRefundAccount();
			expect(response.status).toBe(code);
			expect((await response.json()).error).toMatch(why);
			expect(mocks.moneyReceived).toHaveBeenCalledWith(ORDER_ID);
			expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
			expect(tx.account.update).not.toHaveBeenCalled();
		}
	);

	it('records a partial refund and proportionately reconciles affiliate earnings', async () => {
		const response = await callRefundAccount();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			refundedAmount: 7_500,
			accountId: ACCOUNT_ID,
			orderFullyRefunded: false
		});
		expect(mocks.creditStoreCredit).toHaveBeenCalledWith(
			tx,
			expect.objectContaining({ userId: USER_ID, amount: 7_500, reference: ACCOUNT_ID })
		);
		expect(tx.order.update).toHaveBeenCalledWith({
			where: { id: ORDER_ID },
			data: { refundedAmount: { increment: 7_500 } }
		});
		expect(mocks.reconcileRegular).toHaveBeenCalledWith(ORDER_ID);
		expect(mocks.voidSuper).toHaveBeenCalledWith({
			userId: USER_ID,
			affiliateUserId: AFFILIATE_ID
		});
		expect(mocks.voidPending).not.toHaveBeenCalled();
	});

	it('makes a repeat faulty-account request a no-op with no second credit', async () => {
		tx.account.findUnique.mockResolvedValue(accountRecord({ status: 'faulty' }));
		tx.walletTransaction.findUnique.mockResolvedValue({ amount: 7_500 });

		const response = await callRefundAccount();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, alreadyRefunded: true, refundedAmount: 7_500 });
		expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
		expect(tx.order.update).not.toHaveBeenCalled();
		expect(mocks.reconcileRegular).not.toHaveBeenCalled();
	});

	it('never refunds an account that was already replaced with a working one', async () => {
		tx.account.findUnique.mockResolvedValue(accountRecord({ status: 'replaced' }));

		const response = await callRefundAccount();

		expect(response.status).toBe(409);
		expect((await response.json()).error).toMatch(/already replaced/);
		expect(mocks.creditStoreCredit).not.toHaveBeenCalled();
		expect(tx.order.update).not.toHaveBeenCalled();
	});
});
