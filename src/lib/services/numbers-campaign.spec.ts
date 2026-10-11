import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMarketingEmailMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
	microcopy: { findUnique: vi.fn(), upsert: vi.fn() },
	user: { findMany: vi.fn() },
	order: { findMany: vi.fn() },
	emailNotification: { findMany: vi.fn() },
	category: { findFirst: vi.fn(), updateMany: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('$lib/services/email', () => ({ sendMarketingEmail: sendMarketingEmailMock }));
vi.mock('$lib/services/push-notifications', () => ({ sendPushToUsers: vi.fn() }));
vi.mock('$lib/services/announcement-banner', () => ({ saveAnnouncementBannerConfig: vi.fn() }));
vi.mock('$lib/services/phone-catalog', () => ({ getNumbersPlatformId: vi.fn() }));
vi.mock('$lib/helpers/site-url', () => ({
	getSiteBaseUrl: () => 'https://smm.fastaccs.com'
}));

import { runNumbersCampaignTouches, runNumbersRecoveryEmails } from './numbers-campaign';

describe('automated Numbers discovery emails', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.microcopy.findUnique.mockResolvedValue({
			value: JSON.stringify({ enabled: true, launchedAt: '2026-07-30T00:00:00.000Z' })
		});
		prismaMock.user.findMany.mockResolvedValue([
			{ id: 'user-1', email: 'buyer@example.com', fullName: 'Tobi Customer' }
		]);
		prismaMock.order.findMany.mockResolvedValue([]);
		prismaMock.emailNotification.findMany.mockResolvedValue([]);
		sendMarketingEmailMock.mockResolvedValue({ success: true });
	});

	it('keeps running after the old ten-day launch window and starts with USA/UK discovery copy', async () => {
		const result = await runNumbersCampaignTouches(10);

		expect(result).toMatchObject({ ran: true, sent: 1, touches: { 1: 1 } });
		expect(sendMarketingEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: 'Verification numbers for the apps you use ⚡',
				body: expect.stringMatching(/USA, UK/),
				referenceId: 'numbers-launch:t1:user-1'
			})
		);
	});

	it('stops all remaining discovery emails after a Numbers purchase', async () => {
		prismaMock.order.findMany.mockResolvedValue([{ userId: 'user-1' }]);

		const result = await runNumbersCampaignTouches(10);

		expect(result.sent).toBe(0);
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});
});

describe('Numbers no-code recovery emails', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.microcopy.findUnique.mockResolvedValue({
			value: JSON.stringify({
				enabled: false,
				launchedAt: null,
				recoveryEnabled: true
			})
		});
		prismaMock.emailNotification.findMany.mockResolvedValue([]);
		sendMarketingEmailMock.mockResolvedValue({ success: true });
	});

	it('emails an opted-in customer once when an old Numbers attempt never delivered an OTP', async () => {
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{
					id: 'order-failed',
					userId: 'user-1',
					createdAt: new Date('2026-07-01T00:00:00.000Z'),
					user: { email: 'buyer@example.com', fullName: 'Tobi Customer' },
					orderItems: [{ phoneRental: { status: 'refunded', otp: null, receivedAt: null } }]
				}
			])
			.mockResolvedValueOnce([]);

		const result = await runNumbersRecoveryEmails(10);

		expect(result).toMatchObject({ ran: true, sent: 1 });
		expect(sendMarketingEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				notificationType: 'numbers_recovery',
				referenceId: 'numbers-recovery:order-failed'
			})
		);
	});

	it.each(['awaiting_sms', 'renting', 'replacing', 'pending'])(
		'does not nudge an attempt still %s',
		async (status) => {
			prismaMock.order.findMany.mockResolvedValueOnce([
				{
					id: 'pending',
					status: 'processing',
					userId: 'user-1',
					createdAt: new Date('2026-07-01'),
					user: { email: 'buyer@example.com' },
					orderItems: [{ phoneRental: { status, otp: null, receivedAt: null } }]
				}
			]);
			expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
			expect(sendMarketingEmailMock).not.toHaveBeenCalled();
		}
	);

	it('does not call an unpaid order without a rental a failed number', async () => {
		prismaMock.order.findMany.mockResolvedValueOnce([
			{
				id: 'unpaid',
				status: 'pending',
				userId: 'user-1',
				createdAt: new Date('2026-07-01'),
				user: { email: 'buyer@example.com' },
				orderItems: [{ phoneRental: null }]
			}
		]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
	});

	it('waits 24 hours after the order last changed and avoids ancient attempts', async () => {
		prismaMock.order.findMany.mockResolvedValueOnce([]);
		await runNumbersRecoveryEmails(10);
		expect(prismaMock.order.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					updatedAt: { lte: expect.any(Date) },
					createdAt: { lte: expect.any(Date), gte: expect.any(Date) }
				})
			})
		);
	});

	it('suppresses all failures for a recently nudged customer', async () => {
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{
					id: 'failed',
					status: 'failed',
					userId: 'user-1',
					createdAt: new Date('2026-07-01'),
					user: { email: 'buyer@example.com' },
					orderItems: []
				}
			])
			.mockResolvedValueOnce([]);
		prismaMock.emailNotification.findMany.mockResolvedValue([
			{ userId: 'user-1', referenceId: 'numbers-recovery:other' }
		]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
	});

	it('does not send a second email while a newer attempt is still active', async () => {
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{
					id: 'failed',
					status: 'failed',
					userId: 'user-1',
					createdAt: new Date('2026-07-01'),
					user: { email: 'buyer@example.com' },
					orderItems: []
				}
			])
			.mockResolvedValueOnce([
				{
					userId: 'user-1',
					createdAt: new Date('2026-07-02'),
					orderItems: [{ phoneRental: { status: 'awaiting_sms', otp: null, receivedAt: null } }]
				}
			]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
	});

	it('does not email when that attempt delivered an OTP', async () => {
		prismaMock.order.findMany.mockResolvedValueOnce([
			{
				id: 'order-success',
				userId: 'user-1',
				createdAt: new Date('2026-07-01T00:00:00.000Z'),
				user: { email: 'buyer@example.com', fullName: 'Tobi Customer' },
				orderItems: [
					{
						phoneRental: {
							status: 'received',
							otp: '123456',
							receivedAt: new Date('2026-07-01T00:02:00.000Z')
						}
					}
				]
			}
		]);

		const result = await runNumbersRecoveryEmails(10);

		expect(result).toMatchObject({ ran: true, sent: 0 });
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});

	it('suppresses recovery after a later attempt actually delivers a code', async () => {
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{
					id: 'order-failed',
					userId: 'user-1',
					createdAt: new Date('2026-07-01T00:00:00.000Z'),
					user: { email: 'buyer@example.com', fullName: 'Tobi Customer' },
					orderItems: [{ phoneRental: { status: 'refunded', otp: null, receivedAt: null } }]
				}
			])
			.mockResolvedValueOnce([
				{
					userId: 'user-1',
					createdAt: new Date('2026-07-02T00:00:00.000Z'),
					orderItems: [
						{
							phoneRental: {
								status: 'received',
								otp: '123456',
								receivedAt: new Date('2026-07-02T00:02:00.000Z')
							}
						}
					]
				}
			]);

		const result = await runNumbersRecoveryEmails(10);

		expect(result).toMatchObject({ ran: true, sent: 0, skipped: 1 });
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});

	it('suppresses a code that arrives between the two eligibility reads', async () => {
		const createdAt = new Date('2026-07-01');
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{
					id: 'failed',
					status: 'failed',
					userId: 'user-1',
					createdAt,
					user: { email: 'buyer@example.com' },
					orderItems: []
				}
			])
			.mockResolvedValueOnce([
				{
					userId: 'user-1',
					createdAt,
					orderItems: [
						{ phoneRental: { status: 'received', otp: '123456', receivedAt: new Date() } }
					]
				}
			]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
		expect(sendMarketingEmailMock).not.toHaveBeenCalled();
	});

	it('does not send several failures to one customer in a batch', async () => {
		const attempt = {
			status: 'failed',
			userId: 'user-1',
			createdAt: new Date('2026-07-01'),
			user: { email: 'buyer@example.com' },
			orderItems: []
		};
		prismaMock.order.findMany
			.mockResolvedValueOnce([
				{ ...attempt, id: 'one' },
				{ ...attempt, id: 'two' }
			])
			.mockResolvedValueOnce([]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(1);
		expect(sendMarketingEmailMock).toHaveBeenCalledTimes(1);
	});

	it('does not treat a contradictory failed order with an active rental as terminal', async () => {
		prismaMock.order.findMany.mockResolvedValueOnce([
			{
				id: 'contradictory',
				status: 'failed',
				userId: 'user-1',
				createdAt: new Date('2026-07-01'),
				user: { email: 'buyer@example.com' },
				orderItems: [{ phoneRental: { status: 'awaiting_sms', otp: null, receivedAt: null } }]
			}
		]);
		expect((await runNumbersRecoveryEmails(10)).sent).toBe(0);
	});
});
