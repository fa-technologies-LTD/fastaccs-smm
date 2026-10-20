import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), invalidate: vi.fn(), release: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: mocks.invalidate }));
vi.mock('$lib/services/order-reservations', () => ({ releaseOrderReservations: mocks.release }));
import { PATCH } from './[id]/+server';
let tx: any;
beforeEach(() => {
	vi.clearAllMocks();
	tx = {
		$queryRaw: vi.fn().mockResolvedValue([]),
		order: {
			findUnique: vi
				.fn()
				.mockResolvedValue({
					status: 'paid',
					paymentStatus: 'paid',
					deliveryStatus: 'processing',
					orderType: 'boosting'
				}),
			update: vi
				.fn()
				.mockResolvedValue({ id: 'order', status: 'completed', orderItems: [], user: null })
		},
		orderItem: { findFirst: vi.fn().mockResolvedValue({ id: 'unfinished' }) }
	};
	mocks.transaction.mockImplementation((fn: any) => fn(tx));
});
const call = (body: any) =>
	PATCH({
		params: { id: '11111111-1111-4111-8111-111111111111' },
		locals: { user: { id: 'admin', userType: 'ADMIN' } },
		request: new Request('https://smm.fastaccs.com/api/orders/test', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
it.each([{ status: 'completed' }, { deliveryStatus: 'delivered' }])(
	'does not let a summary-only completion hide unfinished Boosting delivery',
	async (body) => {
		const response = await call(body);
		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('Mark completed');
		expect(tx.order.update).not.toHaveBeenCalled();
	}
);
it('permits a summary update after every Boosting delivery has already completed', async () => {
	tx.orderItem.findFirst.mockResolvedValue(null);
	expect((await call({ status: 'completed' })).status).toBe(200);
	expect(tx.order.update).toHaveBeenCalledOnce();
});
it('preserves account-order completion and does not change the refund lock', async () => {
	tx.order.findUnique.mockResolvedValue({
		status: 'paid',
		paymentStatus: 'paid',
		deliveryStatus: 'processing',
		orderType: 'account'
	});
	expect((await call({ status: 'completed' })).status).toBe(200);
	expect(tx.orderItem.findFirst).not.toHaveBeenCalled();
	tx.order.findUnique.mockResolvedValue({
		status: 'refunded',
		paymentStatus: 'refunded',
		deliveryStatus: 'refunded',
		orderType: 'boosting'
	});
	expect((await call({ status: 'completed' })).status).toBe(409);
});
