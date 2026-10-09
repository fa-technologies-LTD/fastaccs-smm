import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
const alert = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/admin-alerts', () => ({ sendCriticalAdminAlert: alert }));
import { commitBoostSupplierOutcome } from './commit-supplier-outcome';

describe('supplier results serialize with refund/order holds', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		alert.mockResolvedValue(undefined);
	});
	function fixture(status = 'paid', fulfillmentStatus = 'queued') {
		const tx = {
			$queryRaw: vi.fn().mockResolvedValue([]),
			order: {
				findUnique: vi
					.fn()
					.mockResolvedValue({
						status,
						paymentStatus: status === 'refunded' ? 'refunded' : 'paid',
						deliveryStatus: status === 'refunded' ? 'refunded' : 'processing'
					})
			},
			boostFulfillment: {
				findUnique: vi.fn().mockResolvedValue({ status: fulfillmentStatus }),
				update: vi.fn()
			},
			orderItem: { update: vi.fn() }
		};
		const database = { $transaction: vi.fn(async (fn) => fn(tx)) } as unknown as PrismaClient;
		const input = {
			orderId: 'order',
			fulfillmentId: 'fulfillment',
			orderItemId: 'item',
			fulfillmentData: { status: 'submitted', supplierOrderId: 'supplier-123' },
			itemData: {
				boostFulfillmentStatus: 'in_progress',
				boostProviderReference: 'bulk_follows:supplier-123'
			}
		};
		return { tx, database, input };
	}
	it('commits an accepted result for a currently paid active order', async () => {
		const { tx, database, input } = fixture();
		expect(await commitBoostSupplierOutcome(database, input)).toBe(true);
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.boostFulfillment.update).toHaveBeenCalledWith({
			where: { id: 'fulfillment' },
			data: input.fulfillmentData
		});
		expect(alert).not.toHaveBeenCalled();
	});
	it.each(['refunded', 'cancelled', 'payment_review', 'completed'])(
		'does not reopen %s after supplier acceptance',
		async (status) => {
			const { tx, database, input } = fixture(status, 'cancelled');
			expect(await commitBoostSupplierOutcome(database, input)).toBe(false);
			expect(tx.boostFulfillment.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'manual_review',
						supplierOrderId: 'supplier-123',
						nextActionAt: null
					})
				})
			);
			expect(tx.orderItem.update).toHaveBeenCalledWith({
				where: { id: 'item' },
				data: { boostProviderReference: 'bulk_follows:supplier-123' }
			});
			expect(alert).toHaveBeenCalledOnce();
		}
	);
	it('does not overwrite an existing fulfilment review or completed delivery', async () => {
		for (const state of ['manual_review', 'completed']) {
			const { tx, database, input } = fixture('paid', state);
			expect(await commitBoostSupplierOutcome(database, input)).toBe(false);
			expect(tx.boostFulfillment.update.mock.calls[0][0].data.status).not.toBe('submitted');
		}
	});
});
