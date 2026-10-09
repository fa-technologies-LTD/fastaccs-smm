import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	tasks: { upsert: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
	order: { findUnique: vi.fn() },
	sales: vi.fn(),
	super: vi.fn(),
	void: vi.fn(),
	reverse: vi.fn(),
	partial: vi.fn(),
	clawback: vi.fn(),
	alert: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: { refundRecoveryTask: mocks.tasks, order: mocks.order } }));
vi.mock('./affiliate', () => ({
	reconcileAffiliateSales: mocks.sales,
	maybeVoidSuperActivationOnRefund: mocks.super
}));
vi.mock('./affiliate-vesting', () => ({
	voidUnvestedRewardsForOrder: mocks.void,
	reverseVestedRegularRewardForOrder: mocks.reverse,
	reconcileRegularRewardForOrder: mocks.partial
}));
vi.mock('./spend-milestones', () => ({ maybeClawbackSpendMilestones: mocks.clawback }));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: mocks.alert }));
import { drainRefundRecovery, enqueueRefundRecovery } from './refund-recovery';
describe('durable post-refund accounting', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.tasks.findMany.mockResolvedValue([
			{ id: 'task', orderId: 'order', status: 'pending', attempts: 0, leaseExpiresAt: null }
		]);
		mocks.tasks.updateMany.mockResolvedValue({ count: 1 });
		mocks.order.findUnique.mockResolvedValue({
			id: 'order',
			userId: 'buyer',
			affiliateUserId: 'affiliate',
			status: 'refunded',
			paymentStatus: 'refunded',
			deliveryStatus: 'refunded',
			refundedAmount: 100
		});
		mocks.alert.mockResolvedValue(undefined);
	});
	it('enqueues within the supplied refund transaction without resetting existing work', async () => {
		await enqueueRefundRecovery(
			{ refundRecoveryTask: mocks.tasks } as never,
			'order',
			'refund:account:a'
		);
		expect(mocks.tasks.upsert).toHaveBeenCalledWith({
			where: { eventKey: 'refund:account:a' },
			update: {},
			create: { orderId: 'order', eventKey: 'refund:account:a' }
		});
	});
	it('retries when a financial obligation fails after the buyer refund committed', async () => {
		mocks.clawback.mockRejectedValue(new Error('database unavailable'));
		expect(await drainRefundRecovery()).toEqual({ completed: 0, retried: 1 });
		expect(mocks.tasks.updateMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'pending', completedAt: null })
			})
		);
	});
	it('completes only after all full-refund obligations succeed', async () => {
		expect(await drainRefundRecovery()).toEqual({ completed: 1, retried: 0 });
		expect(mocks.reverse).toHaveBeenCalledWith('order');
		expect(mocks.clawback).toHaveBeenCalledWith('buyer', { throwOnError: true });
		expect(mocks.partial).not.toHaveBeenCalled();
	});
	it('reconciles proportionately for partial refunds', async () => {
		mocks.order.findUnique.mockResolvedValue({
			id: 'order',
			userId: 'buyer',
			affiliateUserId: 'affiliate',
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'delivered',
			refundedAmount: 25
		});
		await drainRefundRecovery();
		expect(mocks.partial).toHaveBeenCalledWith('order');
		expect(mocks.reverse).not.toHaveBeenCalled();
	});
	it('does not run work leased by another worker', async () => {
		mocks.tasks.updateMany.mockResolvedValue({ count: 0 });
		await drainRefundRecovery();
		expect(mocks.order.findUnique).not.toHaveBeenCalled();
	});
});
