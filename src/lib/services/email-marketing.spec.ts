import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.hoisted(() => vi.fn());
const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	user: {
		findUnique: vi.fn()
	},
	emailNotification: {
		findFirst: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn()
	}
}));
const prismaMock = vi.hoisted(() => ({
	$transaction: vi.fn(),
	emailNotification: {
		update: vi.fn(),
		create: vi.fn()
	}
}));

vi.mock('nodemailer', () => ({
	default: {
		createTransport: () => ({
			sendMail: sendMailMock
		})
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

import { sendMarketingEmail, sendQueuedMarketingEmail } from './email';

describe('marketing email controls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$transaction.mockImplementation(
			async (callback: (transaction: typeof txMock) => unknown) => callback(txMock)
		);
		txMock.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
		txMock.user.findUnique.mockResolvedValue({
			email: 'buyer@example.com',
			isActive: true,
			emailVerified: true,
			marketingEmailEnabled: true,
			marketingSuppressedAt: null,
			marketingPreferenceToken: '11111111-1111-1111-1111-111111111111'
		});
		txMock.emailNotification.findFirst.mockResolvedValue(null);
		txMock.emailNotification.findUnique.mockResolvedValue(null);
		txMock.emailNotification.create.mockResolvedValue({ id: 'notification-1' });
		txMock.emailNotification.update.mockResolvedValue({ id: 'notification-1' });
		prismaMock.emailNotification.update.mockResolvedValue({ id: 'notification-1' });
		sendMailMock.mockResolvedValue({ messageId: 'message-1' });
	});

	it('reserves and sends an eligible marketing email with preference links', async () => {
		const result = await sendMarketingEmail({
			to: 'ignored@example.com',
			userId: '11111111-1111-1111-1111-111111111111',
			subject: 'Relevant update',
			body: 'A useful update.',
			notificationType: 'marketing_campaign',
			campaignKey: 'campaign:new-service:1'
		});

		expect(result.success).toBe(true);
		expect(txMock.emailNotification.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					classification: 'marketing',
					campaignKey: 'campaign:new-service:1',
					status: 'pending'
				})
			})
		);
		expect(sendMailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				html: expect.stringContaining('/email/preferences/11111111-1111-1111-1111-111111111111')
			})
		);
	});

	it('suppresses optional email after unsubscribe without touching transactional delivery', async () => {
		txMock.user.findUnique.mockResolvedValue({
			email: 'buyer@example.com',
			isActive: true,
			emailVerified: true,
			marketingEmailEnabled: false,
			marketingSuppressedAt: null,
			marketingPreferenceToken: '11111111-1111-1111-1111-111111111111'
		});

		const result = await sendMarketingEmail({
			to: 'buyer@example.com',
			userId: '11111111-1111-1111-1111-111111111111',
			subject: 'Relevant update',
			body: 'A useful update.',
			notificationType: 'marketing_campaign',
			campaignKey: 'campaign:new-service:2'
		});

		expect(result).toEqual({
			success: false,
			suppressed: true,
			suppressionReason: 'unsubscribed'
		});
		expect(sendMailMock).not.toHaveBeenCalled();
		expect(txMock.emailNotification.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'suppressed',
					suppressionReason: 'unsubscribed'
				})
			})
		);
	});

	it('enforces the rolling seven-day marketing limit across campaigns', async () => {
		txMock.emailNotification.findFirst.mockImplementation(
			async ({ where }: { where: Record<string, unknown> }) =>
				where.classification === 'marketing' ? { id: 'recent-marketing-email' } : null
		);

		const result = await sendMarketingEmail({
			to: 'buyer@example.com',
			userId: '11111111-1111-1111-1111-111111111111',
			subject: 'Another update',
			body: 'Another useful update.',
			notificationType: 'affiliate_progress',
			campaignKey: 'affiliate-progress:50:user-1'
		});

		expect(result.suppressionReason).toBe('seven_day_marketing_limit');
		expect(sendMailMock).not.toHaveBeenCalled();
	});

	it('atomically claims and sends an eligible queued marketing email', async () => {
		txMock.emailNotification.findUnique.mockResolvedValue({
			id: '22222222-2222-4222-8222-222222222222',
			userId: '11111111-1111-4111-8111-111111111111',
			email: 'buyer@example.com',
			notificationType: 'admin_broadcast',
			referenceId: 'audience=all_verified',
			subject: 'Relevant update',
			body: 'A useful update.',
			status: 'pending',
			processingAt: null,
			broadcastId: '33333333-3333-4333-8333-333333333333',
			campaignKey: 'admin-broadcast:33333333-3333-4333-8333-333333333333:user-1'
		});

		const result = await sendQueuedMarketingEmail('22222222-2222-4222-8222-222222222222');

		expect(result.success).toBe(true);
		expect(txMock.emailNotification.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: '22222222-2222-4222-8222-222222222222' },
				data: expect.objectContaining({
					status: 'processing',
					classification: 'marketing',
					processingAt: expect.any(Date)
				})
			})
		);
		expect(sendMailMock).toHaveBeenCalledTimes(1);
		expect(prismaMock.emailNotification.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'sent',
					processingAt: null
				})
			})
		);
	});

	it('suppresses a queued broadcast for an unsubscribed user without sending it', async () => {
		txMock.emailNotification.findUnique.mockResolvedValue({
			id: '22222222-2222-4222-8222-222222222222',
			userId: '11111111-1111-4111-8111-111111111111',
			email: 'buyer@example.com',
			notificationType: 'admin_broadcast',
			referenceId: 'audience=all_verified',
			subject: 'Relevant update',
			body: 'A useful update.',
			status: 'pending',
			processingAt: null,
			broadcastId: '33333333-3333-4333-8333-333333333333',
			campaignKey: null
		});
		txMock.user.findUnique.mockResolvedValue({
			email: 'buyer@example.com',
			isActive: true,
			emailVerified: true,
			marketingEmailEnabled: false,
			marketingSuppressedAt: null,
			marketingPreferenceToken: '11111111-1111-1111-1111-111111111111'
		});

		const result = await sendQueuedMarketingEmail('22222222-2222-4222-8222-222222222222');

		expect(result).toEqual({
			success: false,
			suppressed: true,
			suppressionReason: 'unsubscribed'
		});
		expect(sendMailMock).not.toHaveBeenCalled();
		expect(txMock.emailNotification.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'suppressed',
					suppressionReason: 'unsubscribed',
					processingAt: null
				})
			})
		);
	});

	it('does not send a queued email already claimed by another worker', async () => {
		txMock.emailNotification.findUnique.mockResolvedValue({
			id: '22222222-2222-4222-8222-222222222222',
			userId: '11111111-1111-4111-8111-111111111111',
			email: 'buyer@example.com',
			notificationType: 'admin_broadcast',
			referenceId: 'audience=all_verified',
			subject: 'Relevant update',
			body: 'A useful update.',
			status: 'processing',
			processingAt: new Date(),
			broadcastId: '33333333-3333-4333-8333-333333333333',
			campaignKey: null
		});

		const result = await sendQueuedMarketingEmail('22222222-2222-4222-8222-222222222222');

		expect(result.suppressionReason).toBe('already_processed_or_claimed');
		expect(txMock.user.findUnique).not.toHaveBeenCalled();
		expect(sendMailMock).not.toHaveBeenCalled();
	});
});
