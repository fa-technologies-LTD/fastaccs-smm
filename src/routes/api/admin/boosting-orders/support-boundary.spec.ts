import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), apply: vi.fn(), transaction: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.permission }));
vi.mock('$lib/server/boosting-support', async (importActual) => ({
	...(await importActual<typeof import('$lib/server/boosting-support')>()),
	applyBoostSupportAction: mocks.apply
}));
import { POST as admin } from './[id]/support/+server';
import { POST as customer } from '../../orders/[id]/boosting-support/[itemId]/+server';
const id = '11111111-1111-4111-8111-111111111111';
const payload = () => ({
	action: 'request_link',
	message: 'Please send a public link.',
	operationId: crypto.randomUUID(),
	expectedRevision: null
});
function event(body: any, origin = 'https://smm.fastaccs.com') {
	const url = new URL(`https://smm.fastaccs.com/api/support/${id}`);
	return {
		params: { id, itemId: id },
		locals: { user: { id }, adminContext: {} },
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin },
			body: JSON.stringify(body)
		})
	} as never;
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.permission.mockReturnValue(true);
	mocks.transaction.mockImplementation((fn: any) => fn({}));
	mocks.apply.mockResolvedValue({ support: { state: 'awaiting_customer' } });
});
it('requires management permission and same-origin requests', async () => {
	mocks.permission.mockReturnValue(false);
	expect((await admin(event(payload()))).status).toBe(403);
	mocks.permission.mockReturnValue(true);
	expect((await admin(event(payload(), 'https://elsewhere.test'))).status).toBe(403);
	expect(mocks.apply).not.toHaveBeenCalled();
});
it('rejects malformed input before database writes', async () => {
	expect((await admin(event({ ...payload(), action: 'retry' }))).status).toBe(400);
	expect((await admin(event({ ...payload(), expectedRevision: 'wrong' }))).status).toBe(400);
	expect((await admin(event({ ...payload(), message: 'x'.repeat(7000) }))).status).toBe(413);
	expect(mocks.apply).not.toHaveBeenCalled();
});
it('passes the admin identity and confirmation to the guarded transaction', async () => {
	expect(
		(
			await admin(
				event({
					...payload(),
					action: 'confirm_delivery',
					confirmed: true,
					evidence: 'Customer confirmed receipt by support chat.'
				})
			)
		).status
	).toBe(200);
	expect(mocks.apply).toHaveBeenCalledWith(
		{},
		expect.objectContaining({ actorId: id, itemId: id, confirmed: true })
	);
});
it('requires the customer request id and cannot accept a supplier operation from the customer', async () => {
	expect(
		(await customer(event({ ...payload(), link: 'https://instagram.com/example' }))).status
	).toBe(400);
	const body = {
		...payload(),
		expectedRevision: id,
		requestId: id,
		link: 'https://instagram.com/example'
	};
	expect((await customer(event(body, 'https://elsewhere.test'))).status).toBe(403);
	expect((await customer(event(body))).status).toBe(200);
	expect(mocks.apply).toHaveBeenCalledWith(
		{},
		expect.objectContaining({ action: 'reply', actorId: id, orderId: id, itemId: id })
	);
});
