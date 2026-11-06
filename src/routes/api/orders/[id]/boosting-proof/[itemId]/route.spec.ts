import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	events: vi.fn(),
	create: vi.fn()
}));
vi.mock('$lib/prisma', () => ({
	prisma: {
		orderItem: { findFirst: mocks.findFirst },
		orderEvent: { findMany: mocks.events, create: mocks.create }
	}
}));

import { GET } from './+server';

const BUYER = '11111111-1111-4111-8111-111111111111';
const fetchImage = vi.fn(async () => new Response('IMAGE', { status: 200 }));
const proofAdded = {
	type: 'boost_delivery_proof_added',
	occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(),
	metadata: { proof: { publicId: 'boost-delivery-proof/a', format: 'png' } }
};

function open(userId: string | null = BUYER) {
	return GET({
		params: { id: 'order-1', itemId: 'item-1' },
		locals: userId ? { user: { id: userId } } : { user: null },
		fetch: fetchImage
	} as never);
}

function item(reportStatus: string | null) {
	return {
		id: 'item-1',
		orderId: 'order-1',
		boostFulfillment: { complaints: reportStatus ? [{ status: reportStatus }] : [] }
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
	vi.stubEnv('CLOUDINARY_API_KEY', 'key');
	vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
	mocks.findFirst.mockResolvedValue(item('rejected'));
	mocks.events.mockResolvedValue([proofAdded]);
	mocks.create.mockResolvedValue({});
});

describe('customer delivery proof', () => {
	it('shows the proof after a closed report and records the first view', async () => {
		const response = await open();
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.text()).toBe('IMAGE');
		expect(mocks.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: 'boost_delivery_proof_viewed',
				idempotencyKey: 'boosting:proof:boost-delivery-proof/a:viewed'
			})
		});
		expect(mocks.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'item-1', orderId: 'order-1', order: { userId: BUYER } }
			})
		);
	});

	it('looks missing while the report is still open, or to anyone else', async () => {
		mocks.findFirst.mockResolvedValueOnce(item('open'));
		expect((await open()).status).toBe(404);
		mocks.findFirst.mockResolvedValueOnce(null);
		expect((await open('22222222-2222-4222-8222-222222222222')).status).toBe(404);
		expect((await open(null)).status).toBe(401);
		expect(fetchImage).not.toHaveBeenCalled();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('refuses a second look once the reload grace has passed', async () => {
		mocks.events.mockResolvedValueOnce([
			proofAdded,
			{
				type: 'boost_delivery_proof_viewed',
				occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
				metadata: { publicId: 'boost-delivery-proof/a' }
			}
		]);
		const response = await open();
		expect(response.status).toBe(410);
		expect(fetchImage).not.toHaveBeenCalled();
	});

	it('does not count a view when the image could not be loaded', async () => {
		fetchImage.mockResolvedValueOnce(new Response('', { status: 500 }));
		expect((await open()).status).toBe(502);
		expect(mocks.create).not.toHaveBeenCalled();
	});
});
