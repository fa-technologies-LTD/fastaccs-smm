import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	sendMail: vi.fn(),
	tx: {
		$queryRaw: vi.fn(),
		order: { findUnique: vi.fn() },
		emailNotification: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
	},
	prisma: {
		$transaction: vi.fn(),
		emailNotification: { count: vi.fn(), update: vi.fn(), create: vi.fn() }
	}
}));
vi.mock('$env/dynamic/private', () => ({
	env: {
		SMTP_HOST: 'smtp.test',
		SMTP_PORT: '587',
		SMTP_USER: 'mailer@test.invalid',
		SMTP_PASSWORD: 'test',
		SMTP_FROM_EMAIL: 'mailer@test.invalid',
		PUBLIC_BASE_URL: 'https://smm.fastaccs.com'
	}
}));
vi.mock('nodemailer', () => ({
	default: { createTransport: () => ({ sendMail: mocks.sendMail }) }
}));
vi.mock('$lib/prisma', () => ({ prisma: mocks.prisma }));
import { sendEmail, sendOrderConfirmationEmailIfNeeded } from './email';

function completedOrder() {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		orderNumber: 'FA-123-ABC',
		status: 'completed',
		paymentStatus: 'paid',
		createdAt: new Date(),
		totalAmount: 1900,
		userId: 'user-1',
		guestEmail: 'buyer@example.com',
		user: { email: 'buyer@example.com' },
		orderItems: [
			{
				productName: 'X Account',
				quantity: 1,
				totalPrice: 1900,
				boostTargetUrl: null,
				category: { metadata: { delivery_mode: 'instant_auto' } },
				accounts: [
					{
						id: 'account-1',
						username: 'secret-username',
						password: 'secret-password',
						email: 'secret-login-email',
						emailPassword: 'secret-mail-password',
						twoFa: 'secret-twofa',
						linkUrl: 'https://secret-access.test/token',
						credentialExtras: { recovery: 'secret-recovery' }
					}
				]
			}
		]
	};
}

describe('account email send boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
		mocks.tx.$queryRaw.mockResolvedValue([{ id: 'order-1' }]);
		mocks.tx.order.findUnique.mockResolvedValue(completedOrder());
		mocks.tx.emailNotification.findFirst.mockResolvedValue(null);
		mocks.tx.emailNotification.create.mockResolvedValue({ id: 'notification-1' });
		mocks.prisma.emailNotification.count.mockResolvedValue(3);
		mocks.prisma.emailNotification.create.mockResolvedValue({ id: 'notification-2' });
		mocks.sendMail.mockResolvedValue({ messageId: 'mail-1' });
	});

	it('sends no credentials in HTML, plaintext, attachments or the stored email body', async () => {
		await sendOrderConfirmationEmailIfNeeded('11111111-1111-4111-8111-111111111111');
		expect(mocks.sendMail).toHaveBeenCalledOnce();
		const message = mocks.sendMail.mock.calls[0][0];
		const serialized = JSON.stringify({
			message,
			logs: mocks.prisma.emailNotification.update.mock.calls
		});
		for (const secret of [
			'secret-username',
			'secret-password',
			'secret-login-email',
			'secret-mail-password',
			'secret-twofa',
			'secret-access',
			'secret-recovery'
		])
			expect(serialized).not.toContain(secret);
		expect(message.subject).toBe('Your order is ready');
		expect(message.text).toContain('https://smm.fastaccs.com/dashboard?tab=purchases');
		expect(message.html).toContain('https://smm.fastaccs.com/dashboard?tab=purchases');
		expect(message.text.match(/FA-123-ABC/g)).toHaveLength(1);
		expect(mocks.tx.order.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				include: expect.objectContaining({
					orderItems: expect.objectContaining({
						include: expect.objectContaining({
							accounts: {
								where: { status: { in: ['allocated', 'delivered'] } },
								select: { id: true }
							}
						})
					})
				})
			})
		);
	});

	it('does not send before account allocation is completed', async () => {
		mocks.tx.order.findUnique.mockResolvedValue({ ...completedOrder(), status: 'processing' });
		await sendOrderConfirmationEmailIfNeeded('order-1');
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('does not resend a previously sent confirmation', async () => {
		mocks.tx.emailNotification.findFirst.mockResolvedValue({
			id: 'existing',
			status: 'sent',
			createdAt: new Date()
		});
		await sendOrderConfirmationEmailIfNeeded('order-1');
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it.each(['unpaid', 'refunded', 'failed'])(
		'does not announce an account as ready when payment is %s',
		async (paymentStatus) => {
			mocks.tx.order.findUnique.mockResolvedValue({ ...completedOrder(), paymentStatus });
			await sendOrderConfirmationEmailIfNeeded('order-1');
			expect(mocks.sendMail).not.toHaveBeenCalled();
		}
	);

	it.each([
		{ ctaUrl: 'javascript:alert(1)' },
		{ ctaUrl: 'https://smm.fastaccs.com/dashboard', showCta: false }
	])('does not expose disabled or unsafe CTA URLs in plaintext', async (cta) => {
		await sendEmail({
			to: 'buyer@example.com',
			subject: 'Your order is ready',
			body: 'Open your dashboard.',
			notificationType: 'order_delivery',
			...cta
		});
		const mail = mocks.sendMail.mock.calls[0][0];
		expect(mail.text).not.toContain(cta.ctaUrl);
	});
});
