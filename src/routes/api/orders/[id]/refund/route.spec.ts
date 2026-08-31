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
	invalidateStats: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: { findUnique: vi.fn(), update: vi.fn() },
	orderItem: { update: vi.fn() },
	walletTransaction: { aggregate: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
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

function callRefund() {
	return POST({
		params: { id: ORDER_ID },
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
	mocks.creditStoreCredit.mockResolvedValue({});
	mocks.recordOrderEvent.mockResolvedValue(true);
	mocks.voidSuper.mockResolvedValue(undefined);
	mocks.reconcileSales.mockResolvedValue(undefined);
	mocks.voidPending.mockResolvedValue({ voided: 1 });
	mocks.reverseVested.mockResolvedValue({ reversed: 0 });
	mocks.clawbackMilestones.mockResolvedValue(undefined);
	mocks.audit.mockResolvedValue(undefined);
});

describe('full-order refund integrity', () => {
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
		expect(mocks.voidPending).toHaveBeenCalledWith(ORDER_ID);
		expect(mocks.reverseVested).toHaveBeenCalledWith(ORDER_ID);
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
	});
});
