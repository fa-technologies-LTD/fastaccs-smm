import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	user: { findMany: vi.fn() },
	walletTransaction: { findFirst: vi.fn() },
	emailNotification: { findFirst: vi.fn() },
	buckets: vi.fn(),
	send: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: mocks }));
vi.mock('$lib/helpers/site-url', () => ({ getSiteBaseUrl: () => 'https://smm.fastaccs.com' }));
vi.mock('$lib/services/email', () => ({ sendMarketingEmail: mocks.send }));
vi.mock('$lib/services/store-credit', () => ({
	getStoreCreditBuckets: mocks.buckets,
	EARNED_REDEMPTION_CAP_PERCENT: 0.3,
	SC_CREDIT_REFUND: 'store_credit_refund',
	SC_CREDIT_GIFT: 'store_credit_gift',
	SC_CREDIT_AFFILIATE: 'affiliate_credit'
}));
import { runStoreCreditReminders } from './store-credit-reminder';

describe('store-credit reminder automation', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.user.findMany.mockResolvedValue([
			{ id: 'user-1', email: 'buyer@example.com', fullName: 'Tobi Buyer' }
		]);
		mocks.walletTransaction.findFirst.mockResolvedValue({
			id: 'credit-1',
			updatedAt: new Date(Date.now() - 4 * 86400000)
		});
		mocks.emailNotification.findFirst.mockResolvedValue(null);
		mocks.buckets.mockResolvedValue({
			refundAvailable: 500.25,
			earnedAvailable: 1200,
			totalAvailable: 1700.25
		});
		mocks.send.mockResolvedValue({ success: true });
	});
	it('separates refund credit from cleared rewards without promising full rewards redemption', async () => {
		expect(await runStoreCreditReminders()).toEqual({
			processed: 1,
			sent: 1,
			skipped: 0,
			failed: 0
		});
		const mail = mocks.send.mock.calls[0][0];
		expect(mail).toMatchObject({
			subject: 'You have credit to use',
			notificationType: 'store_credit_reminder',
			campaignKey: 'store-credit-reminder:user-1:credit-1'
		});
		expect(mail.body).toContain('Refund credit: ₦500.25');
		expect(mail.body).toContain('Rewards credit: ₦1,200');
		expect(mail.body).toContain('cleared affiliate earnings and gifts');
		expect(mail.body).toContain('up to 30%');
		expect(mail.body).not.toContain('₦1,700.25');
	});
	it('requires opted-in verified active users with an active NGN wallet and available credits', async () => {
		await runStoreCreditReminders();
		expect(mocks.user.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					emailVerified: true,
					marketingEmailEnabled: true,
					marketingUnsubscribedAt: null,
					marketingSuppressedAt: null,
					wallet: { is: { isActive: true, currency: 'NGN' } },
					walletTransactions: { some: expect.objectContaining({ status: 'available' }) }
				})
			})
		);
	});
	it('waits three days after the latest credit becomes available, not the first old credit', async () => {
		mocks.walletTransaction.findFirst.mockResolvedValue({ id: 'new', updatedAt: new Date() });
		expect((await runStoreCreditReminders()).skipped).toBe(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('does not email zero/spent credit even when a historical credit remains in the ledger', async () => {
		mocks.buckets.mockResolvedValue({ refundAvailable: 0, earnedAvailable: 0, totalAvailable: 0 });
		expect((await runStoreCreditReminders()).sent).toBe(0);
		expect(mocks.send).not.toHaveBeenCalled();
	});
	it('dedupes each credit and checks the 30-day cooldown including pending reservations', async () => {
		mocks.emailNotification.findFirst.mockResolvedValue({ id: 'previous' });
		expect((await runStoreCreditReminders()).sent).toBe(0);
		expect(mocks.send).not.toHaveBeenCalled();
		expect(mocks.emailNotification.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: { in: ['sent', 'pending', 'processing'] },
					OR: [
						{ referenceId: 'store-credit-reminder:user-1:credit-1' },
						{ sentAt: { gte: expect.any(Date) } }
					]
				})
			})
		);
	});
	it('refund-only credit does not mention affiliate cash or rewards', async () => {
		mocks.buckets.mockResolvedValue({
			refundAvailable: 25,
			earnedAvailable: 0,
			totalAvailable: 25
		});
		await runStoreCreditReminders();
		expect(mocks.send.mock.calls[0][0].body).not.toMatch(/affiliate|Rewards credit|30%/);
	});
	it('rewards-only copy never calls earnings a refund', async () => {
		mocks.buckets.mockResolvedValue({
			refundAvailable: 0,
			earnedAvailable: 500,
			totalAvailable: 500
		});
		await runStoreCreditReminders();
		expect(mocks.send.mock.calls[0][0].body).not.toContain('Refund credit');
	});
	it('counts shared marketing suppression separately from sending failures', async () => {
		mocks.send.mockResolvedValue({ success: false, suppressed: true });
		expect(await runStoreCreditReminders()).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
	});
	it('records errors without aborting other customers', async () => {
		mocks.buckets.mockRejectedValue(new Error('offline'));
		expect((await runStoreCreditReminders()).failed).toBe(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});
});
