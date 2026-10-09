import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { BoostProviderOrderClient } from './types';

const mocks = vi.hoisted(() => ({ event: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('./fulfillment-worker', () => ({ createBoostOrderClients: vi.fn() }));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.event }));
import { runBoostRefillWorker } from './refill-worker';

const now = new Date('2026-10-08T22:00:00.000Z');
let row: any;
let database: any;
let client: BoostProviderOrderClient;

function update(args: any) {
	const where = args.where;
	if (
		(where.status && row.status !== where.status) ||
		(where.refillLeaseToken && row.refillLeaseToken !== where.refillLeaseToken) ||
		(where.supplierCaseId &&
			typeof where.supplierCaseId === 'string' &&
			row.supplierCaseId !== where.supplierCaseId) ||
		(where.updatedAt && +row.updatedAt !== +where.updatedAt) ||
		(where.providerAction?.in && !where.providerAction.in.includes(row.providerAction))
	)
		return { count: 0 };
	Object.assign(row, args.data, { updatedAt: new Date(+row.updatedAt + 1) });
	return { count: 1 };
}

beforeEach(() => {
	vi.clearAllMocks();
	row = {
		id: 'complaint-1',
		status: 'escalated',
		type: 'dropped',
		providerAction: 'refill_requested',
		userId: 'user-1',
		supplierCaseId: '321',
		refillPollFailures: 0,
		refillState: 'pending',
		refillCheckedAt: null,
		refillNextCheckAt: null,
		refillLeaseToken: null,
		refillLeaseExpiresAt: null,
		updatedAt: new Date(+now - 60_000),
		escalatedAt: new Date(+now - 60_000),
		fulfillment: {
			provider: 'bulk_follows',
			orderItemId: 'item-1',
			orderItem: {
				orderId: '11111111-1111-4111-8111-111111111111',
				order: { status: 'completed', paymentStatus: 'paid', deliveryStatus: 'delivered' }
			}
		}
	};
	database = {
		boostComplaint: {
			findMany: vi.fn().mockImplementation(async () => [structuredClone(row)]),
			updateMany: vi.fn().mockImplementation(async (args) => update(args)),
			findUnique: vi.fn().mockImplementation(async () => structuredClone(row))
		},
		$queryRaw: vi.fn().mockResolvedValue([]),
		notification: { create: vi.fn().mockResolvedValue({}) },
		$transaction: vi.fn().mockImplementation(async (fn: any) => {
			const before = structuredClone(row);
			try {
				return await fn(database);
			} catch (error) {
				row = before;
				throw error;
			}
		})
	};
	client = {
		id: 'bulk_follows',
		submitOrder: vi.fn(),
		requestRefill: vi.fn(),
		getStatuses: vi.fn(),
		getRefillStatus: vi.fn().mockResolvedValue({ state: 'completed' })
	};
	mocks.event.mockResolvedValue(undefined);
});
const run = () => runBoostRefillWorker({ database: database as PrismaClient, client, now });

describe('durable refill polling', () => {
	it('resolves only the existing refill report, atomically recording completion and a notification', async () => {
		expect(await run()).toMatchObject({ checked: 1, completed: 1 });
		expect(client.getRefillStatus).toHaveBeenCalledWith('321');
		expect(client.requestRefill).not.toHaveBeenCalled();
		expect(client.submitOrder).not.toHaveBeenCalled();
		expect(row).toMatchObject({
			status: 'resolved',
			providerAction: 'refill_completed',
			refillState: 'completed',
			refillCheckedAt: now,
			refillNextCheckAt: null,
			refillLeaseToken: null
		});
		expect(database.notification.create).toHaveBeenCalledOnce();
		expect(mocks.event).toHaveBeenCalledWith(
			expect.objectContaining({ idempotencyKey: 'boosting:refill:complaint-1:completed' }),
			database
		);
	});
	it('does not resolve a refunded order when a successful supplier response arrives afterwards', async () => {
		vi.mocked(client.getRefillStatus!).mockImplementation(async () => {
			row.fulfillment.orderItem.order.status = 'refunded';
			row.fulfillment.orderItem.order.paymentStatus = 'refunded';
			return { state: 'completed' };
		});
		expect(await run()).toMatchObject({ completed: 0, needsReview: 1 });
		expect(row).toMatchObject({
			status: 'escalated',
			providerAction: 'refill_after_order_hold',
			refillState: 'unknown',
			refillNextCheckAt: null
		});
		expect(database.notification.create).not.toHaveBeenCalled();
	});
	it('does not contact the supplier for an already cancelled order', async () => {
		row.fulfillment.orderItem.order.status = 'cancelled';
		await run();
		expect(client.getRefillStatus).not.toHaveBeenCalled();
		expect(row.providerAction).toBe('refill_after_order_hold');
	});
	it('does not overwrite a report manually resolved while the read is running', async () => {
		vi.mocked(client.getRefillStatus!).mockImplementation(async () => {
			row.status = 'resolved';
			row.providerAction = 'manual_follow_up';
			return { state: 'completed' };
		});
		expect(await run()).toMatchObject({ completed: 0, skipped: 1 });
		expect(row.providerAction).toBe('manual_follow_up');
		expect(database.notification.create).not.toHaveBeenCalled();
	});
	it('does not commit a response after losing its lease', async () => {
		vi.mocked(client.getRefillStatus!).mockImplementation(async () => {
			row.refillLeaseToken = 'another-worker';
			return { state: 'completed' };
		});
		expect(await run()).toMatchObject({ completed: 0, skipped: 1 });
		expect(row.refillLeaseToken).toBe('another-worker');
		expect(database.notification.create).not.toHaveBeenCalled();
	});
	it('reschedules processing and does not create notifications on every poll', async () => {
		vi.mocked(client.getRefillStatus!).mockResolvedValue({ state: 'in_progress' });
		await run();
		expect(row).toMatchObject({
			status: 'escalated',
			providerAction: 'refill_in_progress',
			refillState: 'in_progress',
			refillNextCheckAt: new Date(+now + 300_000)
		});
		expect(database.notification.create).not.toHaveBeenCalled();
	});
	it('keeps supplier rejection in support review, not resolved or a new refill purchase', async () => {
		vi.mocked(client.getRefillStatus!).mockResolvedValue({ state: 'rejected' });
		expect(await run()).toMatchObject({ completed: 0, needsReview: 1 });
		expect(row).toMatchObject({
			status: 'escalated',
			providerAction: 'refill_rejected',
			refillNextCheckAt: null
		});
		expect(client.requestRefill).not.toHaveBeenCalled();
	});
	it('backs off an outage without replacing the last successful timestamp or resubmitting', async () => {
		row.refillCheckedAt = new Date(+now - 600_000);
		vi.mocked(client.getRefillStatus!).mockRejectedValue(new Error('timeout'));
		expect(await run()).toMatchObject({ failed: 1, completed: 0 });
		expect(row).toMatchObject({
			refillPollFailures: 1,
			refillCheckedAt: new Date(+now - 600_000),
			refillNextCheckAt: new Date(+now + 300_000),
			refillLeaseToken: null
		});
		expect(client.requestRefill).not.toHaveBeenCalled();
	});
	it('ends repeated status failures in an admin-review state, not endless automatic retries', async () => {
		row.refillPollFailures = 4;
		vi.mocked(client.getRefillStatus!).mockRejectedValue(new Error('unavailable'));
		expect(await run()).toMatchObject({ needsReview: 1 });
		expect(row).toMatchObject({
			providerAction: 'refill_status_review_required',
			refillNextCheckAt: null,
			refillState: 'unknown'
		});
	});
	it('does not poll an unclaimed complaint or the unverified SMM Raja contract', async () => {
		database.boostComplaint.updateMany.mockResolvedValue({ count: 0 });
		expect(await run()).toMatchObject({ skipped: 1 });
		expect(client.getRefillStatus).not.toHaveBeenCalled();
		await runBoostRefillWorker({ database, client: { ...client, id: 'smm_raja' }, now });
		expect(client.getRefillStatus).not.toHaveBeenCalled();
	});
	it('recovers a stale dispatch claim to manual review without attempting a second remote refill', async () => {
		database.boostComplaint.updateMany
			.mockResolvedValueOnce({ count: 1 })
			.mockResolvedValue({ count: 0 });
		expect(await run()).toMatchObject({ uncertainRecovered: 1 });
		expect(database.boostComplaint.updateMany).toHaveBeenCalledWith({
			where: {
				status: 'escalating',
				providerAction: 'supplier_action_started',
				updatedAt: { lt: new Date(+now - 900000) }
			},
			data: expect.objectContaining({ status: 'escalation_unknown', refillState: 'unknown' })
		});
		expect(client.requestRefill).not.toHaveBeenCalled();
		expect(client.getRefillStatus).not.toHaveBeenCalled();
	});
});
