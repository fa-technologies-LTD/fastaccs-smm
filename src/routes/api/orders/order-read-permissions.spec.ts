import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	findUnique: vi.fn(),
	findNotes: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		order: {
			findMany: mocks.findMany,
			findUnique: mocks.findUnique
		},
		adminAuditLog: {
			findMany: mocks.findNotes
		}
	}
}));

import { GET as getOrders } from './+server';
import { GET as getOrder } from './[id]/+server';

const adminUser = {
	id: 'admin-without-role',
	userType: 'ADMIN'
};

const assignedAdminContext = {
	userId: 'assigned-admin',
	role: 'READ_ONLY',
	permissions: ['admin:access'],
	canViewRevenue: false
};

function buildBuyerOrder(input: {
	status: string;
	paymentStatus: string;
	deliveryMode?: 'instant_auto' | 'manual_handover';
}) {
	return {
		id: 'order-1',
		userId: 'buyer-1',
		status: input.status,
		paymentStatus: input.paymentStatus,
		orderItems: [
			{
				category: {
					metadata: {
						delivery_mode: input.deliveryMode || 'instant_auto'
					}
				},
				accounts: [
					{
						id: 'account-1',
						status: 'allocated',
						username: 'private-username',
						password: 'private-password'
					}
				]
			}
		],
		user: {
			id: 'buyer-1',
			email: 'buyer@example.com',
			fullName: 'Buyer'
		}
	};
}

describe('order read permissions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findMany.mockResolvedValue([]);
		mocks.findNotes.mockResolvedValue([]);
	});

	it('treats an ADMIN user without an assigned admin context as a normal order owner', async () => {
		const response = await getOrders({
			url: new URL('https://smm.fastaccs.com/api/orders'),
			locals: {
				user: adminUser,
				session: null,
				adminContext: null
			}
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: adminUser.id },
				include: { orderItems: true }
			})
		);
	});

	it('allows an assigned read-only admin to use the all-orders read path', async () => {
		const response = await getOrders({
			url: new URL('https://smm.fastaccs.com/api/orders'),
			locals: {
				user: { ...adminUser, id: assignedAdminContext.userId },
				session: null,
				adminContext: assignedAdminContext
			}
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {},
				include: expect.objectContaining({
					orderItems: expect.any(Object),
					user: {
						select: {
							id: true,
							email: true,
							fullName: true
						}
					}
				})
			})
		);
	});

	it('forbids an unassigned ADMIN user from reading another buyer order', async () => {
		mocks.findUnique.mockResolvedValue(
			buildBuyerOrder({ status: 'completed', paymentStatus: 'paid' })
		);

		const response = await getOrder({
			params: { id: 'order-1' },
			locals: {
				user: adminUser,
				session: null,
				adminContext: null
			}
		} as never);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ data: null, error: 'Forbidden' });
		expect(mocks.findNotes).not.toHaveBeenCalled();
	});

	it('never releases credentials to the buyer before payment and order confirmation', async () => {
		mocks.findUnique.mockResolvedValue(
			buildBuyerOrder({ status: 'pending_payment', paymentStatus: 'pending' })
		);

		const response = await getOrder({
			params: { id: 'order-1' },
			locals: {
				user: { id: 'buyer-1', userType: 'REGISTERED' },
				session: null,
				adminContext: null
			}
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.orderItems[0].accounts).toEqual([]);
	});

	it('releases fulfilled automatic-delivery credentials after confirmed payment', async () => {
		mocks.findUnique.mockResolvedValue(
			buildBuyerOrder({ status: 'completed', paymentStatus: 'paid' })
		);

		const response = await getOrder({
			params: { id: 'order-1' },
			locals: {
				user: { id: 'buyer-1', userType: 'REGISTERED' },
				session: null,
				adminContext: null
			}
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.orderItems[0].accounts).toEqual([
			expect.objectContaining({
				id: 'account-1',
				username: 'private-username',
				password: 'private-password'
			})
		]);
	});

	it('never releases stored credentials for manual-handover items', async () => {
		mocks.findUnique.mockResolvedValue(
			buildBuyerOrder({
				status: 'completed',
				paymentStatus: 'paid',
				deliveryMode: 'manual_handover'
			})
		);

		const response = await getOrder({
			params: { id: 'order-1' },
			locals: {
				user: { id: 'buyer-1', userType: 'REGISTERED' },
				session: null,
				adminContext: null
			}
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.orderItems[0].accounts).toEqual([]);
	});
});
