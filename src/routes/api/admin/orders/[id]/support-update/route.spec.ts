import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	order: { findUnique: vi.fn() },
	orderEvent: { findUnique: vi.fn(), create: vi.fn() },
	notification: { create: vi.fn() }
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
const allowed = vi.hoisted(() => vi.fn());
vi.mock('$lib/prisma', () => ({ prisma: db }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: allowed }));
import { POST } from './+server';
const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
function call(message: unknown = 'We are checking delivery.', origin = 'https://smm.fastaccs.com') {
	const url = new URL(`https://smm.fastaccs.com/api/admin/orders/${id}/support-update`);
	return POST({
		params: { id },
		url,
		locals: { user: { id: 'admin' }, adminContext: {} },
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify({ requestId, message })
		})
	} as never);
}
beforeEach(() => {
	vi.clearAllMocks();
	allowed.mockReturnValue(true);
	db.$transaction.mockImplementation(async (fn) => fn(tx));
	tx.order.findUnique.mockResolvedValue({ id, userId: 'buyer', orderType: 'boosting' });
	tx.orderEvent.findUnique.mockResolvedValue(null);
});
it('saves an update and notification together without mutating supplier/payment state', async () => {
	expect((await call()).status).toBe(200);
	expect(tx.orderEvent.create).toHaveBeenCalledWith({
		data: expect.objectContaining({ type: 'customer_support_update', actorUserId: 'admin' })
	});
	expect(tx.notification.create).toHaveBeenCalledWith({
		data: expect.objectContaining({
			userId: 'buyer',
			orderId: id,
			message: 'We are checking delivery.'
		})
	});
});
it('treats a repeated request as the same update, not another notification', async () => {
	tx.orderEvent.findUnique.mockResolvedValue({ description: 'We are checking delivery.' });
	expect(await (await call()).json()).toMatchObject({ success: true, alreadySent: true });
	expect(tx.notification.create).not.toHaveBeenCalled();
});
it('rejects reusing a request key with changed wording', async () => {
	tx.orderEvent.findUnique.mockResolvedValue({ description: 'Earlier message.' });
	expect((await call()).status).toBe(409);
	expect(tx.notification.create).not.toHaveBeenCalled();
});
it('enforces support permissions and origin before database access', async () => {
	allowed.mockReturnValue(false);
	expect((await call()).status).toBe(401);
	allowed.mockReturnValue(true);
	expect((await call('Hello', 'https://evil.example')).status).toBe(403);
	expect(db.$transaction).not.toHaveBeenCalled();
});
it.each(['x', 'x'.repeat(501), 123])('rejects invalid wording', async (message) => {
	expect((await call(message)).status).toBe(400);
	expect(db.$transaction).not.toHaveBeenCalled();
});
it('does not claim guest notification delivery', async () => {
	tx.order.findUnique.mockResolvedValue({ id, userId: null, orderType: 'boosting' });
	expect((await call()).status).toBe(409);
	expect(tx.orderEvent.create).not.toHaveBeenCalled();
});
