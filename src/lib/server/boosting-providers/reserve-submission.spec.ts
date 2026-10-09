import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { reserveBoostSubmission } from './reserve-submission';

const now = new Date('2026-10-08T22:00:00.000Z');
let tx: any;
let db: PrismaClient;
const input = {
	orderId: '11111111-1111-4111-8111-111111111111',
	fulfillmentId: 'fulfillment-1',
	routeId: 'route-1',
	provider: 'bulk_follows' as const,
	serviceId: '4215',
	leaseToken: 'lease-1',
	attemptCount: 0,
	requestFingerprint: 'request-1',
	supplierCostUsd: 0.01,
	balanceSafetyUsd: 5
};
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	tx = {
		$queryRaw: vi.fn().mockResolvedValue([]),
		order: {
			findUnique: vi
				.fn()
				.mockResolvedValue({ status: 'paid', paymentStatus: 'paid', deliveryStatus: 'processing' })
		},
		boostFulfillment: {
			findUnique: vi
				.fn()
				.mockResolvedValue({
					status: 'queued',
					leaseToken: 'lease-1',
					leaseExpiresAt: new Date(+now + 120000),
					attemptCount: 0,
					supplierOrderId: null,
					submittedAt: null,
					attempts: []
				})
		},
		boostProviderState: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
		boostAttempt: { create: vi.fn().mockResolvedValue({}) }
	};
	db = { $transaction: vi.fn().mockImplementation((fn) => fn(tx)) } as unknown as PrismaClient;
});
afterEach(() => vi.useRealTimers());

describe('final Boosting dispatch reservation gate', () => {
	it('locks and rechecks payment before reserving funds and recording dispatch intent', async () => {
		expect(await reserveBoostSubmission(db, input)).toBe('reserved');
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
			tx.order.findUnique.mock.invocationCallOrder[0]
		);
		expect(tx.order.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
			tx.boostProviderState.updateMany.mock.invocationCallOrder[0]
		);
		expect(tx.boostAttempt.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ outcome: 'started', requestFingerprint: 'request-1' })
			})
		);
	});
	it.each(['cancelled', 'refunded', 'failed', 'completed'])(
		'does not reserve or start dispatch after the queued order became %s',
		async (status) => {
			tx.order.findUnique.mockResolvedValue({
				status,
				paymentStatus: 'paid',
				deliveryStatus: 'processing'
			});
			expect(await reserveBoostSubmission(db, input)).toBe('order_hold');
			expect(tx.boostProviderState.updateMany).not.toHaveBeenCalled();
			expect(tx.boostAttempt.create).not.toHaveBeenCalled();
		}
	);
	it.each([
		{ leaseToken: 'another-worker' },
		{ leaseExpiresAt: new Date(+now - 1) },
		{ status: 'cancelled' },
		{ attemptCount: 1 },
		{ supplierOrderId: '123' },
		{ submittedAt: now },
		{ attempts: [{ type: 'submission', outcome: 'submission_unknown' }] }
	])('does not dispatch stale, previously submitted, or uncertain work: %j', async (override) => {
		const current = await tx.boostFulfillment.findUnique();
		tx.boostFulfillment.findUnique.mockResolvedValue({ ...current, ...override });
		expect(await reserveBoostSubmission(db, input)).toBe('state_changed');
		expect(tx.boostProviderState.updateMany).not.toHaveBeenCalled();
		expect(tx.boostAttempt.create).not.toHaveBeenCalled();
	});
	it('does not dispatch if the protected projected balance cannot be reserved', async () => {
		tx.boostProviderState.updateMany.mockResolvedValue({ count: 0 });
		expect(await reserveBoostSubmission(db, input)).toBe('balance_unavailable');
		expect(tx.boostAttempt.create).not.toHaveBeenCalled();
	});
	it('rejects non-finite supplier cost before opening a transaction', async () => {
		expect(await reserveBoostSubmission(db, { ...input, supplierCostUsd: NaN })).toBe(
			'balance_unavailable'
		);
		expect(db.$transaction).not.toHaveBeenCalled();
	});
});
