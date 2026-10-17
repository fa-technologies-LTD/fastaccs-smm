import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), poll: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: { orderItem: { findUnique: mocks.find } } }));
vi.mock('$lib/services/phone-fulfillment', () => ({ pollPhoneRentalSms: mocks.poll }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: () => false }));
import { GET } from './+server';
beforeEach(() => {
	vi.clearAllMocks();
	mocks.poll.mockResolvedValue({ status: 'refunded' });
});
async function request(userId = 'buyer') {
	return GET({ params: { orderItemId: 'item' }, locals: { user: { id: userId } } } as never);
}
it('does not poll or read private accounting for another customer', async () => {
	mocks.find.mockResolvedValue({ order: { userId: 'buyer' } });
	expect((await request('other')).status).toBe(403);
	expect(mocks.poll).not.toHaveBeenCalled();
	expect(mocks.find).toHaveBeenCalledOnce();
});
it.each([true, false])(
	'shows refund completion only with committed accounting: %s',
	async (confirmed) => {
		mocks.find
			.mockResolvedValueOnce({ order: { userId: 'buyer' } })
			.mockResolvedValueOnce({
				phoneRental: { refundedAt: confirmed ? new Date() : null, saleAmountNgn: 500 },
				order: { userId: 'buyer', refundedAmount: confirmed ? 500 : 0 }
			});
		const response = await request();
		expect(await response.json()).toMatchObject({ status: 'refunded', refundConfirmed: confirmed });
		expect(response.headers.get('cache-control')).toBe('no-store');
	}
);
it('recognizes an accounting commit that completed during a recovery poll', async () => {
	mocks.poll.mockResolvedValue({ status: 'preparing' });
	mocks.find
		.mockResolvedValueOnce({ order: { userId: 'buyer' } })
		.mockResolvedValueOnce({
			phoneRental: { refundedAt: new Date(), saleAmountNgn: 500 },
			order: { userId: 'buyer', refundedAmount: 500 }
		});
	expect(await (await request()).json()).toMatchObject({
		status: 'refunded',
		refundConfirmed: true
	});
});
