import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn() }));
vi.mock('$lib/prisma', () => ({
	prisma: { orderEvent: { findMany: mocks.findMany, create: mocks.create } }
}));

import {
	BOOST_PROOF_ADDED,
	BOOST_PROOF_DELETED,
	BOOST_PROOF_VIEWED,
	customerProofAccess,
	deleteExpiredBoostProofs,
	readBoostProof
} from './boost-delivery-proof';

const DAY = 24 * 60 * 60 * 1000;
const added = (publicId: string, at: string) => ({
	type: BOOST_PROOF_ADDED,
	occurredAt: at,
	metadata: { proof: { publicId, format: 'jpg', bytes: 1000, uploadedAt: at, uploadedBy: 'admin' } }
});
const marked = (type: string, publicId: string, at: string) => ({
	type,
	occurredAt: at,
	metadata: { publicId }
});
const closed = [{ status: 'rejected' }];
const t0 = '2026-11-06T10:00:00.000Z';
const at = (ms: number) => Date.parse(t0) + ms;

describe('delivery proof state', () => {
	it('keeps the newest upload and ignores marks for the one it replaced', () => {
		const state = readBoostProof([
			marked(BOOST_PROOF_VIEWED, 'proof/old', '2026-11-06T09:30:00.000Z'),
			added('proof/new', t0),
			added('proof/old', '2026-11-06T09:00:00.000Z')
		]);
		expect(state.proof?.publicId).toBe('proof/new');
		expect(state.firstViewedAt).toBeNull();
		expect(state.expiresAt).toBe(new Date(at(30 * DAY)).toISOString());
	});

	it('is invisible to the customer until a report of theirs is closed', () => {
		const state = readBoostProof([added('proof/a', t0)]);
		expect(customerProofAccess(state, [], at(1000))).toBe('none');
		expect(customerProofAccess(state, [{ status: 'open' }], at(1000))).toBe('none');
		expect(customerProofAccess(state, [{ status: 'validated' }], at(1000))).toBe('none');
		expect(customerProofAccess(state, closed, at(1000))).toBe('available');
		expect(customerProofAccess(state, [{ status: 'resolved' }], at(1000))).toBe('available');
	});

	it('opens once, allows a reload for ten minutes, then stays closed', () => {
		const state = readBoostProof([
			added('proof/a', t0),
			marked(BOOST_PROOF_VIEWED, 'proof/a', new Date(at(DAY)).toISOString())
		]);
		expect(customerProofAccess(state, closed, at(DAY + 9 * 60 * 1000))).toBe('viewing');
		expect(customerProofAccess(state, closed, at(DAY + 11 * 60 * 1000))).toBe('used');
	});

	it('is gone after 30 days or once deleted', () => {
		const state = readBoostProof([added('proof/a', t0)]);
		expect(customerProofAccess(state, closed, at(30 * DAY))).toBe('none');
		const deleted = readBoostProof([
			added('proof/a', t0),
			marked(BOOST_PROOF_DELETED, 'proof/a', new Date(at(DAY)).toISOString())
		]);
		expect(customerProofAccess(deleted, closed, at(2 * DAY))).toBe('none');
	});
});

describe('deleting expired proof', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
		vi.stubEnv('CLOUDINARY_API_KEY', 'key');
		vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
		mocks.create.mockResolvedValue({});
	});

	it('deletes each old image once and records it, skipping ones already deleted', async () => {
		mocks.findMany
			.mockResolvedValueOnce([
				{ orderId: 'o1', orderItemId: 'i1', ...added('proof/a', t0) },
				{ orderId: 'o2', orderItemId: 'i2', ...added('proof/b', t0) }
			])
			.mockResolvedValueOnce([{ idempotencyKey: 'boosting:proof:proof/b:deleted' }]);
		const destroy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ result: 'ok' }), { status: 200 }));

		const result = await deleteExpiredBoostProofs(at(31 * DAY));

		expect(result).toEqual({ deleted: 1 });
		expect(destroy).toHaveBeenCalledOnce();
		expect(String(destroy.mock.calls[0][0])).toContain('/image/destroy');
		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: BOOST_PROOF_DELETED,
				orderItemId: 'i1',
				idempotencyKey: 'boosting:proof:proof/a:deleted'
			})
		});
		destroy.mockRestore();
	});

	it('keeps the record open when Cloudinary does not confirm, so the next run retries', async () => {
		mocks.findMany
			.mockResolvedValueOnce([{ orderId: 'o1', orderItemId: 'i1', ...added('proof/a', t0) }])
			.mockResolvedValueOnce([]);
		const destroy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{}', { status: 500 }));
		expect(await deleteExpiredBoostProofs(at(31 * DAY))).toEqual({ deleted: 0 });
		expect(mocks.create).not.toHaveBeenCalled();
		destroy.mockRestore();
	});
});
