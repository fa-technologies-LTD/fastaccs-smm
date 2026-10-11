import { prisma } from '$lib/prisma';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import { sendMarketingEmail } from '$lib/services/email';
import {
	getStoreCreditBuckets,
	EARNED_REDEMPTION_CAP_PERCENT,
	SC_CREDIT_AFFILIATE,
	SC_CREDIT_GIFT,
	SC_CREDIT_REFUND
} from '$lib/services/store-credit';

const WAIT_MS = 3 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const CREDIT_TYPES = [SC_CREDIT_REFUND, SC_CREDIT_GIFT, SC_CREDIT_AFFILIATE];

const amount = (value: number) => `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/** One reminder per new credit, after three days; never more than once in 30 days.
 * Ledger buckets exclude pending rewards, reserved payouts and redeemed credit.
 * Shared marketing dispatch handles consent, address suppression and atomic dedupe.
 */
export async function runStoreCreditReminders(limit = 100): Promise<{
	processed: number;
	sent: number;
	skipped: number;
	failed: number;
}> {
	const batchLimit = Number.isSafeInteger(limit) ? Math.min(300, Math.max(1, limit)) : 100;
	const now = Date.now();
	const cutoff = new Date(now - WAIT_MS);
	const baseUrl = getSiteBaseUrl();
	let cursor: string | null = null;
	let processed = 0,
		sent = 0,
		skipped = 0,
		failed = 0;
	do {
		const users: Array<{ id: string; email: string | null; fullName: string | null }> =
			await prisma.user.findMany({
				where: {
					userType: 'REGISTERED',
					isActive: true,
					emailVerified: true,
					marketingEmailEnabled: true,
					marketingUnsubscribedAt: null,
					marketingSuppressedAt: null,
					email: { not: '' },
					wallet: { is: { isActive: true, currency: 'NGN' } },
					walletTransactions: {
						some: { type: { in: CREDIT_TYPES }, status: 'available', updatedAt: { lte: cutoff } }
					}
				},
				select: { id: true, email: true, fullName: true },
				orderBy: { id: 'asc' },
				take: 100,
				...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
			});
		if (!users.length) break;
		cursor = users.at(-1)!.id;
		for (const user of users) {
			if (processed >= batchLimit * 10 || sent >= batchLimit) break;
			processed += 1;
			try {
				const latestCredit = await prisma.walletTransaction.findFirst({
					where: { userId: user.id, type: { in: CREDIT_TYPES }, status: 'available' },
					orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
					select: { id: true, updatedAt: true }
				});
				if (!user.email || !latestCredit || latestCredit.updatedAt > cutoff) {
					skipped += 1;
					continue;
				}
				const referenceId = `store-credit-reminder:${user.id}:${latestCredit.id}`;
				const previous = await prisma.emailNotification.findFirst({
					where: {
						userId: user.id,
						notificationType: 'store_credit_reminder',
						status: { in: ['sent', 'pending', 'processing'] },
						OR: [{ referenceId }, { sentAt: { gte: new Date(now - COOLDOWN_MS) } }]
					},
					select: { id: true }
				});
				if (previous) {
					skipped += 1;
					continue;
				}
				const buckets = await getStoreCreditBuckets(user.id);
				const earnedAvailable = Math.floor(buckets.earnedAvailable);
				if (
					!Number.isFinite(buckets.totalAvailable) ||
					buckets.refundAvailable + earnedAvailable <= 0
				) {
					skipped += 1;
					continue;
				}
				const lines: string[] = [];
				if (buckets.refundAvailable > 0)
					lines.push(
						`Refund credit: ${amount(buckets.refundAvailable)}. Use it toward your next order.`
					);
				if (earnedAvailable > 0)
					lines.push(
						`Rewards credit: ${amount(earnedAvailable)}. This includes cleared affiliate earnings and gifts, and can cover up to ${EARNED_REDEMPTION_CAP_PERCENT * 100}% of an order.`
					);
				const firstName = user.fullName?.trim().split(/\s+/)[0] || 'there';
				const result = await sendMarketingEmail({
					to: user.email,
					userId: user.id,
					subject: 'You have credit to use',
					body: `Hi ${firstName},\n\n${lines.join('\n\n')}\n\nChoose what you need from the store. Your available credit appears at checkout.`,
					ctaText: 'Browse the store',
					ctaUrl: baseUrl,
					notificationType: 'store_credit_reminder',
					referenceId,
					campaignKey: referenceId
				});
				if (result.success) sent += 1;
				else if (result.suppressed) skipped += 1;
				else failed += 1;
			} catch {
				failed += 1;
			}
		}
		if (users.length < 100) break;
	} while (processed < batchLimit * 10 && sent < batchLimit);
	return { processed, sent, skipped, failed };
}
