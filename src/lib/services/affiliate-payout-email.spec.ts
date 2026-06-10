import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn());
const txMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	walletTransaction: {
		findUnique: vi.fn()
	},
	emailNotification: {
		findFirst: vi.fn(),
		create: vi.fn()
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
	recoverAffiliatePayoutStatusEmails,
	sendAffiliatePayoutStatusEmailIfNeeded
} from './affiliate-payout-email';

describe('affiliate payout status emails', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$transaction.mockImplementation(
			async (callback: (transaction: typeof txMock) => unknown) => callback(txMock)
		);
		txMock.$queryRaw.mockResolvedValue([{ id: '11111111-1111-1111-1111-111111111111' }]);
		txMock.walletTransaction.findUnique.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
			type: 'affiliate_payout',
			status: 'requested',
			amount: 20_000,
			reference: 'affiliate:payout:request:user-1:123',
			userId: 'user-1',
			user: {
				email: 'affiliate@example.com',
				fullName: 'Ada Affiliate',
				isActive: true
			}
		});
		txMock.emailNotification.findFirst.mockResolvedValue(null);
		txMock.emailNotification.create.mockResolvedValue({ id: 'notification-1' });
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'message-1' });
	});

	it('sends a truthful request-received email once for the requested state', async () => {
		const first = await sendAffiliatePayoutStatusEmailIfNeeded({
			payoutTransactionId: '11111111-1111-1111-1111-111111111111',
			expectedStatus: 'requested'
		});

		txMock.emailNotification.findFirst.mockResolvedValue({
			id: 'notification-1',
			status: 'sent',
			createdAt: new Date()
		});
		const duplicate = await sendAffiliatePayoutStatusEmailIfNeeded({
			payoutTransactionId: '11111111-1111-1111-1111-111111111111',
			expectedStatus: 'requested'
		});

		expect(first).toBe(true);
		expect(duplicate).toBe(false);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: 'Your Store Credit payout request was received',
				referenceId: 'affiliate_payout:11111111-1111-1111-1111-111111111111:requested'
			})
		);
	});

	it('does not mislabel under-review as approved', async () => {
		txMock.walletTransaction.findUnique.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
			type: 'affiliate_payout',
			status: 'under_review',
			amount: 20_000,
			reference: 'affiliate:payout:request:user-1:123',
			userId: 'user-1',
			user: {
				email: 'affiliate@example.com',
				fullName: 'Ada Affiliate',
				isActive: true
			}
		});

		const result = await sendAffiliatePayoutStatusEmailIfNeeded({
			payoutTransactionId: '11111111-1111-1111-1111-111111111111',
			expectedStatus: 'under_review'
		});

		expect(result).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('recovers missing emails for observable payout states', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				id: '11111111-1111-1111-1111-111111111111',
				status: 'requested'
			}
		]);

		const result = await recoverAffiliatePayoutStatusEmails();

		expect(result).toEqual({
			processed: 1,
			sent: 1,
			failed: 0
		});
		expect(prismaMock.walletTransaction.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: { in: ['requested', 'paid', 'reversed'] }
				})
			})
		);
	});
});
