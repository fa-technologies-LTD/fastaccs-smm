import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	transaction: vi.fn(),
	recordOrderEvent: vi.fn(),
	invalidateStats: vi.fn()
}));
const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	account: { findUnique: vi.fn(), update: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/services/order-events', () => ({ recordOrderEvent: mocks.recordOrderEvent }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/admin-metrics', () => ({
	invalidateAdminStatsCache: mocks.invalidateStats
}));

import { POST } from './+server';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '66666666-6666-4666-8666-666666666666';

const call = () =>
	POST({
		params: { id: ORDER_ID },
		request: new Request('https://smm.fastaccs.com/api/orders/x/replace-account', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ accountId: ACCOUNT_ID, reason: 'Login failed' })
		}),
		locals: { user: { id: '55555555-5555-4555-8555-555555555555' }, adminContext: {} }
	} as never);

const account = (status = 'delivered', order: Record<string, unknown> = {}) => ({
	id: ACCOUNT_ID,
	status,
	categoryId: '77777777-7777-4777-8777-777777777777',
	orderItem: {
		id: 'item-1',
		order: {
			id: ORDER_ID,
			orderNumber: 'ORD-1',
			status: 'completed',
			paymentStatus: 'paid',
			deliveryStatus: 'delivered',
			...order
		}
	}
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
	tx.$queryRaw.mockResolvedValueOnce([]); // order lock
});

describe('replace a faulty account', () => {
	it('gives the buyer a fresh account of the same type and retires the old one, with no money moved', async () => {
		tx.account.findUnique.mockResolvedValue(account());
		tx.$queryRaw.mockResolvedValueOnce([{ id: NEW_ID }]);
		const response = await call();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, newAccountId: NEW_ID });
		expect(tx.account.update).toHaveBeenCalledWith({
			where: { id: ACCOUNT_ID },
			data: { status: 'replaced' }
		});
		expect(mocks.recordOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'account_replaced',
				accountId: ACCOUNT_ID,
				metadata: expect.objectContaining({ replacementAccountId: NEW_ID })
			}),
			tx
		);
		expect(mocks.recordOrderEvent.mock.calls[0][0]).not.toHaveProperty('amount');
	});

	it('changes nothing when that account type is out of stock', async () => {
		tx.account.findUnique.mockResolvedValue(account());
		tx.$queryRaw.mockResolvedValueOnce([]);
		const response = await call();
		expect(response.status).toBe(409);
		expect((await response.json()).error).toMatch(/No accounts of this type are in stock/);
		expect(tx.account.update).not.toHaveBeenCalled();
		expect(mocks.recordOrderEvent).not.toHaveBeenCalled();
	});

	it('refuses closed orders and accounts already refunded or replaced', async () => {
		tx.account.findUnique.mockResolvedValue(account('delivered', { status: 'refunded' }));
		expect((await call()).status).toBe(409);
		tx.$queryRaw.mockResolvedValueOnce([]);
		tx.account.findUnique.mockResolvedValue(account('faulty'));
		expect((await call()).status).toBe(409);
		tx.$queryRaw.mockResolvedValueOnce([]);
		tx.account.findUnique.mockResolvedValue(account('replaced'));
		expect((await call()).status).toBe(409);
		expect(tx.account.update).not.toHaveBeenCalled();
	});

	it('is for admins who manage orders only', async () => {
		mocks.hasPermission.mockReturnValue(false);
		expect((await call()).status).toBe(401);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});
