import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn());
const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	emailNotification: {
		findFirst: vi.fn(),
		create: vi.fn()
	},
	user: {
		findUnique: vi.fn()
	}
}));
const prismaMock = vi.hoisted(() => ({
	$transaction: vi.fn(),
	walletTransaction: {
		findMany: vi.fn()
	}
}));

vi.mock('$lib/prisma', () => ({
	prisma: prismaMock
}));

vi.mock('$lib/services/email', () => ({
	sendEmail: sendEmailMock
}));

import {
	recoverFirstStoreCreditEmails,
	sendAffiliateUnlockEmailIfNeeded,
	sendFirstStoreCreditEmailIfNeeded
} from './affiliate-notification-email';

describe('first Store Credit email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$transaction.mockImplementation(
			async (callback: (transaction: typeof txMock) => unknown) => callback(txMock)
		);
		txMock.$queryRaw.mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111' }]);
		txMock.emailNotification.findFirst.mockResolvedValue(null);
		txMock.emailNotification.create.mockResolvedValue({ id: 'notification-1' });
		txMock.user.findUnique.mockResolvedValue({
			email: 'affiliate@example.com',
			fullName: 'Ada Affiliate',
			isActive: true,
			wallet: { balance: 350 }
		});
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'message-1' });
	});

	it('sends only for the first lifetime credit', async () => {
		const first = await sendFirstStoreCreditEmailIfNeeded({
			userId: '11111111-1111-1111-1111-111111111111',
			creditAmount: 150
		});

		txMock.emailNotification.findFirst.mockResolvedValue({
			id: 'notification-1',
			status: 'sent',
			createdAt: new Date()
		});

		const later = await sendFirstStoreCreditEmailIfNeeded({
			userId: '11111111-1111-1111-1111-111111111111',
			creditAmount: 200
		});

		expect(first).toBe(true);
		expect(later).toBe(false);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notificationType: 'affiliate_store_credit',
				referenceId: 'affiliate_first_credit:11111111-1111-1111-1111-111111111111',
				body: expect.stringContaining('your first Store Credit just landed')
			})
		);
	});

	it('recovers the oldest first credit for each affiliate', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				userId: '11111111-1111-1111-1111-111111111111',
				amount: 150
			}
		]);

		const result = await recoverFirstStoreCreditEmails();

		expect(result).toEqual({
			processed: 1,
			sent: 1,
			failed: 0
		});
		expect(prismaMock.walletTransaction.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				distinct: ['userId'],
				orderBy: { createdAt: 'asc' }
			})
		);
	});

	it('reserves the affiliate unlock email so concurrent triggers cannot resend it', async () => {
		const first = await sendAffiliateUnlockEmailIfNeeded('11111111-1111-1111-1111-111111111111');

		txMock.emailNotification.findFirst.mockResolvedValue({
			id: 'notification-1',
			status: 'sent',
			createdAt: new Date()
		});
		const duplicate = await sendAffiliateUnlockEmailIfNeeded(
			'11111111-1111-1111-1111-111111111111'
		);

		expect(first).toBe(true);
		expect(duplicate).toBe(false);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notificationType: 'affiliate_unlock',
				referenceId: 'affiliate_unlock:11111111-1111-1111-1111-111111111111'
			})
		);
	});
});
