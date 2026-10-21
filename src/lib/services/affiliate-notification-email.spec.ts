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
	},
	microcopy: {
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

const superTerms = vi.hoisted(() => ({ onNewTerms: false }));
vi.mock('$lib/services/super-affiliate-terms', async (original) => ({
	...(await original<typeof import('$lib/services/super-affiliate-terms')>()),
	isSuperAffiliateOnNewTerms: async () => superTerms.onNewTerms
}));
vi.mock('$lib/services/affiliate', () => ({
	getAffiliateConfig: async () => ({
		superActivationReward: 700,
		superActivationSpendThreshold: 3_500,
		superActivationOrderThreshold: 3
	})
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
			wallet: { balance: 350 },
			affiliatePrograms: [{ affiliateCode: 'AFF001' }],
			affiliatePayoutDetails: null
		});
		txMock.microcopy.findUnique.mockResolvedValue({ value: '5000' });
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'message-1' });
		superTerms.onNewTerms = false;
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
				subject: 'Your first referral reward is pending 🎉',
				body: expect.stringContaining(
					'can clear after 14 days, subject to refund and review checks'
				)
			})
		);
	});

	it('states the 24-hour Super wait without promising automatic clearance or regular commissions', async () => {
		await sendFirstStoreCreditEmailIfNeeded({
			userId: 'super-1',
			creditAmount: 700,
			superReward: true
		});
		const body = sendEmailMock.mock.calls[0][0].body;
		expect(body).toContain('can clear after 24 hours, subject to refund and review checks');
		expect(body).not.toContain('14 days');
		expect(body).not.toContain('first two eligible account orders');
	});

	it('uses the original reward kind when recovering a Super first-reward email', async () => {
		prismaMock.walletTransaction.findMany.mockResolvedValue([
			{
				userId: 'super-1',
				amount: 700,
				metadata: { kind: 'super_activation' },
				reference: 'super:activation:super-1:buyer-1'
			}
		]);
		await recoverFirstStoreCreditEmails();
		expect(sendEmailMock.mock.calls[0][0].body).toContain('after 24 hours');
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

	it('tells regular affiliates payouts are on Saturdays', async () => {
		await sendAffiliateUnlockEmailIfNeeded('11111111-1111-1111-1111-111111111111');
		const body = sendEmailMock.mock.calls[0][0].body as string;
		expect(body).toContain('You earn 5% on each of those orders');
		expect(body).toContain('Payouts are processed on Saturdays.');
	});

	it('tells a Super on the new terms how she earns and that payouts take 1–3 days', async () => {
		superTerms.onNewTerms = true;
		txMock.user.findUnique.mockResolvedValue({
			email: 'stacy@example.com',
			fullName: 'Stacy',
			isActive: true,
			affiliatePrograms: [{ affiliateCode: 'STACY', isSuperAffiliate: true }]
		});
		await sendAffiliateUnlockEmailIfNeeded('11111111-1111-1111-1111-111111111111');
		const body = sendEmailMock.mock.calls[0][0].body as string;
		expect(body).toContain('You earn ₦700 when a friend you referred pays ₦3,500 in cash');
		expect(body).toContain('Payouts are processed within 1–3 days.');
		expect(body).not.toContain('Saturdays');
		expect(body).not.toMatch(/₦\d[\d,]* (profit|cost|margin)/i);
	});
});
