import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	transaction: vi.fn(),
	recordOrderEvent: vi.fn()
}));

const tx = vi.hoisted(() => ({
	orderItem: { update: vi.fn() },
	order: { update: vi.fn() }
}));

const item = {
	id: 'item-1',
	boostTargetUrl: 'https://facebook.com/old-page',
	boostFulfillmentStatus: 'needs_link',
	category: {
		name: 'Facebook Page Followers',
		metadata: { boosting_platform: 'facebook', boosting_action_type: 'followers' }
	},
	order: { userId: 'buyer-1', paymentStatus: 'paid' }
};

vi.mock('$lib/prisma', () => ({
	prisma: {
		orderItem: { findFirst: vi.fn() },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/helpers/boosting-service-config', () => ({
	getBoostingServiceConfig: () => ({ platform: 'facebook', actionType: 'followers' })
}));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));

import { prisma } from '$lib/prisma';
import { PATCH } from './+server';

function callUpdate(targetUrl: string) {
	return PATCH({
		params: { id: 'order-1', itemId: item.id },
		request: new Request('https://smm.fastaccs.com/api/orders/order-1/boosting-link/item-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ targetUrl })
		}),
		locals: { user: { id: 'buyer-1' }, adminContext: null }
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(false);
	vi.mocked(prisma.orderItem.findFirst).mockResolvedValue(item as never);
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
	tx.orderItem.update.mockResolvedValue({});
	tx.order.update.mockResolvedValue({});
	mocks.recordOrderEvent.mockResolvedValue(undefined);
});

describe('customer boosting-link correction', () => {
	it('accepts Facebook share links and returns the item to the pending queue', async () => {
		const response = await callUpdate('https://www.facebook.com/share/1DS9YYbpNP/?mibextid=wwXIfr');
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			success: true,
			data: { boostFulfillmentStatus: 'pending' }
		});
		expect(tx.orderItem.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					boostTargetUrl: 'https://www.facebook.com/share/1DS9YYbpNP/?mibextid=wwXIfr',
					boostFulfillmentStatus: 'pending'
				})
			})
		);
		expect(mocks.recordOrderEvent).toHaveBeenCalledOnce();
	});

	it('rejects an off-platform replacement link', async () => {
		const response = await callUpdate('https://example.com/not-facebook');
		expect(response.status).toBe(400);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('does not let one customer change another customer’s boosting item', async () => {
		vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({
			...item,
			order: { ...item.order, userId: 'another-buyer' }
		} as never);

		const response = await callUpdate('https://facebook.com/new-page');

		expect(response.status).toBe(403);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('does not let a customer change the target after fulfillment has started', async () => {
		vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({
			...item,
			boostFulfillmentStatus: 'in_progress'
		} as never);
		const response = await callUpdate('https://facebook.com/new-page');
		expect(response.status).toBe(409);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});
