import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	order: { findUnique: vi.fn(), updateMany: vi.fn() },
	milestones: vi.fn(),
	boosting: vi.fn(),
	manual: vi.fn(),
	queue: vi.fn(),
	notify: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: { order: mocks.order } }));
vi.mock('$lib/services/spend-milestones', () => ({ maybeGrantSpendMilestones: mocks.milestones }));
vi.mock('$lib/services/promotions', () => ({ recordPromotionRedemption: async () => undefined }));
vi.mock('$lib/services/email', () => ({
	sendOrderConfirmationEmailIfNeeded: async () => undefined
}));
vi.mock('$lib/services/order-delivery-mode', () => ({
	isBoostingOrder: mocks.boosting,
	isManualHandoverOrder: mocks.manual
}));
vi.mock('$lib/server/boosting-providers/fulfillment-worker', () => ({
	queuePaidBoostFulfillments: mocks.queue
}));
vi.mock('$lib/services/manual-handover', () => ({
	notifyBoostingOrderPaid: mocks.notify,
	notifyManualHandoverOrderPaid: mocks.notify
}));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: vi.fn() }));
vi.mock('$lib/server/ga4-measurement-protocol', () => ({
	isGa4MeasurementProtocolConfigured: () => false
}));

import { recoverPaidOrder } from './payment-settlement';

describe('paid recovery concurrent terminal transitions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it.each(['boosting', 'manual'])('does not resurrect a refunded %s order', async (mode) => {
		const live = {
			id: 'order',
			userId: 'buyer',
			status: 'paid',
			paymentStatus: 'paid',
			deliveryStatus: 'processing'
		};
		mocks.order.findUnique.mockImplementation(async () => ({ ...live }));
		mocks.milestones.mockImplementation(async () => {
			Object.assign(live, {
				status: 'refunded',
				paymentStatus: 'refunded',
				deliveryStatus: 'refunded'
			});
		});
		mocks.boosting.mockResolvedValue(mode === 'boosting');
		mocks.manual.mockResolvedValue(mode === 'manual');
		mocks.order.updateMany.mockImplementation(async ({ where }) => {
			const allowed =
				where.status.in.includes(live.status) &&
				where.paymentStatus.in.includes(live.paymentStatus) &&
				live.deliveryStatus !== where.deliveryStatus.not;
			return { count: allowed ? 1 : 0 };
		});
		const result = await recoverPaidOrder(live.id, 'reconcile');
		expect(result.status).toBe('CANCELLED');
		expect(live.status).toBe('refunded');
		expect(mocks.queue).not.toHaveBeenCalled();
		expect(mocks.notify).not.toHaveBeenCalled();
	});
});
