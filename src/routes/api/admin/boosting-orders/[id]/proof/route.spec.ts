import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	create: vi.fn(),
	hasPermission: vi.fn()
}));
vi.mock('$lib/prisma', () => ({
	prisma: { orderItem: { findUnique: mocks.findUnique }, orderEvent: { create: mocks.create } }
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));

import { POST } from './+server';

const ITEM = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://smm.fastaccs.com';

function upload(file: File | null, origin = ORIGIN) {
	const body = new FormData();
	if (file) body.append('file', file);
	return POST({
		params: { id: ITEM },
		request: new Request(`${ORIGIN}/api/admin/boosting-orders/${ITEM}/proof`, {
			method: 'POST',
			headers: { origin },
			body
		}),
		locals: { user: { id: 'admin-1' }, adminContext: {} },
		url: new URL(`${ORIGIN}/api/admin/boosting-orders/${ITEM}/proof`)
	} as never);
}
const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'proof.png', { type: 'image/png' });

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
	vi.stubEnv('CLOUDINARY_API_KEY', 'key');
	vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
	mocks.hasPermission.mockReturnValue(true);
	mocks.create.mockResolvedValue({});
	mocks.findUnique.mockResolvedValue({
		id: ITEM,
		orderId: 'order-1',
		boostTargetUrl: 'https://x.com/someone',
		order: { status: 'paid', paymentStatus: 'paid' }
	});
});

describe('admin delivery proof upload', () => {
	it('stores the screenshot privately and records it on the order', async () => {
		const cloudinary = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(
					JSON.stringify({ public_id: 'boost-delivery-proof/x', format: 'png', bytes: 10 }),
					{ status: 200 }
				)
			);
		const response = await upload(png());
		expect(response.status).toBe(200);
		const sent = cloudinary.mock.calls[0][1]?.body as FormData;
		expect(sent.get('type')).toBe('authenticated');
		expect(String(sent.get('public_id'))).toMatch(/^boost-delivery-proof\//);
		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: 'boost_delivery_proof_added',
				orderItemId: ITEM,
				idempotencyKey: 'boosting:proof:boost-delivery-proof/x:added'
			})
		});
		cloudinary.mockRestore();
	});

	it('takes only images up to 5MB, from this site, for paid Boosting items', async () => {
		const text = new File(['hello'], 'note.txt', { type: 'text/plain' });
		expect((await upload(text)).status).toBe(400);
		expect((await upload(png(5 * 1024 * 1024 + 1))).status).toBe(400);
		expect((await upload(null)).status).toBe(400);
		expect((await upload(png(), 'https://evil.example')).status).toBe(403);
		mocks.findUnique.mockResolvedValueOnce({
			id: ITEM,
			orderId: 'order-1',
			boostTargetUrl: 'https://x.com/someone',
			order: { status: 'pending', paymentStatus: 'pending' }
		});
		expect((await upload(png())).status).toBe(409);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('refuses admins who cannot manage orders', async () => {
		mocks.hasPermission.mockReturnValue(false);
		expect((await upload(png())).status).toBe(403);
	});
});
