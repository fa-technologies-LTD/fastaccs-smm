import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	updateAccounts: vi.fn(),
	sendEmail: vi.fn(),
	invalidate: vi.fn(),
	event: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: { PUBLIC_BASE_URL: 'https://smm.fastaccs.com' } }));
vi.mock('$lib/prisma', () => ({
	prisma: {
		order: { findUnique: mocks.findUnique, update: mocks.update },
		account: { updateMany: mocks.updateAccounts }
	}
}));
vi.mock('$lib/services/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('$lib/services/admin-metrics', () => ({ invalidateAdminStatsCache: mocks.invalidate }));
vi.mock('$lib/services/order-events', () => ({ recordOrderEventBestEffort: mocks.event }));
import { POST } from './+server';

const order = {
	id: 'order-1',
	orderNumber: 'FA-123-ABC',
	status: 'completed',
	paymentStatus: 'paid',
	guestEmail: 'buyer@example.com',
	userId: 'buyer-1',
	totalAmount: 1900,
	orderItems: [
		{
			productName: 'X Account',
			accounts: [
				{
					id: 'account-1',
					username: 'secret-username',
					password: 'secret-password',
					emailPassword: 'secret-email-password',
					twoFa: 'secret-twofa',
					credentialExtras: { recovery: 'secret-recovery' }
				}
			]
		}
	]
};
const event = (user = { id: 'admin-1', userType: 'ADMIN' }) => ({
	params: { id: 'order-1' },
	locals: { user },
	request: new Request('https://smm.fastaccs.com/api/orders/order-1/deliver', {
		method: 'POST',
		body: JSON.stringify({ deliveryMethod: 'email' })
	})
});

describe('account delivery notification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findUnique.mockResolvedValue(order);
		mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'message-1' });
	});

	it('only sends a public summary and authenticated dashboard link', async () => {
		const response = await POST(event() as never);
		expect(response.status).toBe(200);
		const mail = mocks.sendEmail.mock.calls[0][0];
		expect(mail.subject).toBe('Your order is ready');
		expect(mail.ctaUrl).toBe('https://smm.fastaccs.com/dashboard?tab=purchases');
		expect(mail.body.match(/FA-123-ABC/g)).toHaveLength(1);
		expect(JSON.stringify(mail)).not.toContain('secret-');
		expect(mocks.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				include: {
					orderItems: { include: { accounts: { where: expect.any(Object), select: { id: true } } } }
				}
			})
		);
		expect(mocks.updateAccounts).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: { in: ['account-1'] } } })
		);
	});

	it.each(['unpaid', 'failed', 'refunded'])(
		'does not send or mark delivered when payment is %s',
		async (paymentStatus) => {
			mocks.findUnique.mockResolvedValue({ ...order, paymentStatus });
			const response = await POST(event() as never);
			expect(response.status).toBe(400);
			expect(mocks.sendEmail).not.toHaveBeenCalled();
			expect(mocks.update).not.toHaveBeenCalled();
		}
	);

	it('does not mark delivery successful when the notification fails', async () => {
		mocks.sendEmail.mockResolvedValue({ success: false, error: 'Mail unavailable' });
		const response = await POST(event() as never);
		expect(response.status).toBe(500);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.updateAccounts).not.toHaveBeenCalled();
	});

	it('rejects a buyer calling the delivery endpoint', async () => {
		const response = await POST(event({ id: 'buyer-1', userType: 'CUSTOMER' }) as never);
		expect(response.status).toBe(401);
		expect(mocks.findUnique).not.toHaveBeenCalled();
		expect(mocks.sendEmail).not.toHaveBeenCalled();
	});
});
