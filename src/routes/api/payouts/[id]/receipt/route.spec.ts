import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), hasPermission: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: { walletTransaction: { findUnique: mocks.findUnique } } }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));

import { GET } from './+server';

const PAYOUT = '22222222-2222-4222-8222-222222222222';
const AFFILIATE = '11111111-1111-4111-8111-111111111111';
const fetchImage = vi.fn(async () => new Response('IMAGE', { status: 200 }));

function view(userId: string | null) {
	return GET({
		params: { id: PAYOUT },
		locals: userId ? { user: { id: userId }, adminContext: {} } : { user: null },
		fetch: fetchImage
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
	vi.stubEnv('CLOUDINARY_API_KEY', 'key');
	vi.stubEnv('CLOUDINARY_API_SECRET', 'secret');
	mocks.hasPermission.mockReturnValue(false);
	mocks.findUnique.mockResolvedValue({
		userId: AFFILIATE,
		type: 'affiliate_payout',
		metadata: { receipt: { publicId: 'payout-receipts/a', format: 'jpg' } }
	});
});

describe('payout receipt viewing', () => {
	it('shows the receipt to the affiliate who was paid', async () => {
		const response = await view(AFFILIATE);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/jpeg');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.text()).toBe('IMAGE');
	});

	it('hides it from other customers as if it did not exist', async () => {
		const response = await view('33333333-3333-4333-8333-333333333333');
		expect(response.status).toBe(404);
		expect(fetchImage).not.toHaveBeenCalled();
	});

	it('lets an affiliate manager see it, and asks signed-out visitors to sign in', async () => {
		mocks.hasPermission.mockReturnValue(true);
		expect((await view('44444444-4444-4444-8444-444444444444')).status).toBe(200);
		expect((await view(null)).status).toBe(401);
	});

	it('finds nothing for a payout without a receipt or a row that is not a payout', async () => {
		mocks.findUnique.mockResolvedValueOnce({
			userId: AFFILIATE,
			type: 'affiliate_payout',
			metadata: {}
		});
		expect((await view(AFFILIATE)).status).toBe(404);
		mocks.findUnique.mockResolvedValueOnce({
			userId: AFFILIATE,
			type: 'store_credit_refund',
			metadata: { receipt: { publicId: 'x', format: 'jpg' } }
		});
		expect((await view(AFFILIATE)).status).toBe(404);
	});
});
