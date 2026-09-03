import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	transaction: vi.fn(),
	recordOrderEvent: vi.fn()
}));

const tx = vi.hoisted(() => ({
	orderItem: { update: vi.fn(), findMany: vi.fn() },
	order: { update: vi.fn() },
	notification: { create: vi.fn() }
}));

const existing = {
	id: 'item-1',
	orderId: '11111111-1111-4111-8111-111111111111',
	boostTargetUrl: 'https://facebook.com/fastaccs',
	boostFulfillmentStatus: 'pending',
	order: {
		userId: '22222222-2222-4222-8222-222222222222',
		orderNumber: 'ORD-BOOST-1',
		paymentStatus: 'paid'
	}
};

vi.mock('$lib/prisma', () => ({
	prisma: {
		orderItem: { findUnique: vi.fn() },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));

import { prisma } from '$lib/prisma';
import { PATCH } from './+server';

function callPatch(body: Record<string, unknown>) {
	return PATCH({
		params: { id: existing.id },
		request: new Request('https://smm.fastaccs.com/api/admin/boosting-orders/item-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user: { id: 'admin-1' }, adminContext: {} }
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	vi.mocked(prisma.orderItem.findUnique).mockResolvedValue(existing as never);
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
	tx.orderItem.update.mockResolvedValue({ ...existing, boostFulfillmentStatus: 'needs_link' });
	tx.orderItem.findMany.mockResolvedValue([{ boostFulfillmentStatus: 'needs_link' }]);
	tx.order.update.mockResolvedValue({});
	tx.notification.create.mockResolvedValue({ id: 'notice-1' });
	mocks.recordOrderEvent.mockResolvedValue(undefined);
});

describe('manual boosting order workflow', () => {
	it('requires a customer-facing reason before requesting a replacement link', async () => {
		const response = await callPatch({ status: 'needs_link', reason: '' });
		expect(response.status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('does not mutate an unpaid boosting order', async () => {
		vi.mocked(prisma.orderItem.findUnique).mockResolvedValue({
			...existing,
			order: { ...existing.order, paymentStatus: 'pending' }
		} as never);

		const response = await callPatch({ status: 'in_progress' });

		expect(response.status).toBe(409);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('requests a new link, records the reason, and notifies the buyer atomically', async () => {
		const response = await callPatch({
			status: 'needs_link',
			reason: 'Please send the public Facebook Page link.'
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(tx.orderItem.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ boostFulfillmentStatus: 'needs_link' })
			})
		);
		expect(tx.notification.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					type: 'boosting_link_review',
					orderId: existing.orderId
				})
			})
		);
		expect(mocks.recordOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'boosting_link_review_requested',
				description: 'Please send the public Facebook Page link.'
			}),
			tx
		);
	});

	it('marks an unfulfillable paid boost for review without creating a refund path', async () => {
		tx.orderItem.findMany.mockResolvedValue([{ boostFulfillmentStatus: 'rejected' }]);
		const response = await callPatch({
			status: 'rejected',
			reason: 'Supplier does not support it.'
		});

		expect(response.status).toBe(200);
		expect(tx.order.update).toHaveBeenCalledWith({
			where: { id: existing.orderId },
			data: { status: 'paid', deliveryStatus: 'failed', deliveredAt: null }
		});
		expect(tx.notification.create).toHaveBeenCalledOnce();
	});

	it('marks the order delivered only when every boosting item is complete', async () => {
		tx.orderItem.findMany.mockResolvedValue([
			{ boostFulfillmentStatus: 'completed' },
			{ boostFulfillmentStatus: 'completed' }
		]);
		const response = await callPatch({ status: 'completed' });

		expect(response.status).toBe(200);
		expect(tx.order.update).toHaveBeenCalledWith({
			where: { id: existing.orderId },
			data: {
				status: 'completed',
				deliveryStatus: 'delivered',
				deliveredAt: expect.any(Date)
			}
		});
	});
});
