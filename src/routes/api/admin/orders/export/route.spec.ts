import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());

vi.mock('$lib/prisma', () => ({ prisma: { order: { findMany } } }));
vi.mock('$lib/auth/admin-roles', () => ({
	hasAdminPermission: vi.fn((context, permission) =>
		Boolean(context?.permissions?.includes(permission))
	)
}));

import { GET } from './+server';

describe('paid order CSV export', () => {
	beforeEach(() => vi.clearAllMocks());

	it('requires revenue permission', async () => {
		const response = await GET({
			locals: { user: { id: 'admin-1' }, adminContext: { permissions: ['admin:access'] } }
		} as never);

		expect(response.status).toBe(403);
		expect(findMany).not.toHaveBeenCalled();
	});

	it('exports one row per paid order item with the requested five columns', async () => {
		findMany.mockResolvedValue([
			{
				id: 'order-db-id',
				orderNumber: 'ORD-1001',
				paidAt: new Date('2026-09-30T09:15:00.000Z'),
				orderItems: [
					{
						productName: 'X Verified Account (+500 followers)',
						quantity: 2,
						totalPrice: 44_000
					}
				]
			}
		]);

		const response = await GET({
			locals: {
				user: { id: 'owner-1' },
				adminContext: { permissions: ['admin:revenue:view'] }
			}
		} as never);
		const csv = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/csv');
		expect(csv).toContain('"order_id","paid_at","product","quantity","amount"');
		expect(csv).toContain(
			'"ORD-1001","2026-09-30T09:15:00.000Z","X Verified Account (+500 followers)","2","44000.00"'
		);
	});
});
