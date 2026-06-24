import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from '$lib/services/email';
import {
	PROGRESS_MILESTONES,
	getAffiliateConfig,
	maybeSendAffiliateUnlockInvite
} from '$lib/services/affiliate';
import { recoverFirstStoreCreditEmails } from '$lib/services/affiliate-notification-email';
import { recoverAffiliatePayoutStatusEmails } from '$lib/services/affiliate-payout-email';

function getBaseUrl(): string {
	return (process.env.PUBLIC_BASE_URL || 'https://smm.fastaccs.com').replace(/\/+$/, '');
}

function getFirstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

const ACTIVATION_NUDGE_MIN_PROGRAM_AGE_DAYS = 3;
const ACTIVATION_NUDGE_COOLDOWN_DAYS = 14;

export async function runAffiliateLifecycleEmailRecovery(limit = 300): Promise<{
	processed: number;
	sent: number;
	skipped: number;
	failed: number;
	firstCredit: Awaited<ReturnType<typeof recoverFirstStoreCreditEmails>>;
	payoutStatus: Awaited<ReturnType<typeof recoverAffiliatePayoutStatusEmails>>;
}> {
	const config = await getAffiliateConfig();
	const users = await prisma.user.findMany({
		where: {
			isActive: true,
			emailVerified: true,
			email: { not: null },
			userType: { not: 'ADMIN' },
			orders: {
				some: {
					OR: [{ status: 'paid' }, { status: 'completed' }, { paymentStatus: 'paid' }]
				}
			}
		},
		select: {
			id: true,
			email: true,
			fullName: true,
			isAffiliateEnabled: true,
			affiliatePrograms: {
				select: {
					id: true,
					affiliateCode: true,
					totalReferrals: true,
					status: true,
					createdAt: true
				},
				take: 1
			},
			orders: {
				where: {
					OR: [{ status: 'paid' }, { status: 'completed' }, { paymentStatus: 'paid' }]
				},
				select: { totalAmount: true }
			}
		},
		orderBy: { registeredAt: 'asc' },
		take: Math.min(Math.max(limit, 1), 1000)
	});

	let sent = 0;
	let skipped = 0;
	let failed = 0;
	const baseUrl = getBaseUrl();

	for (const user of users) {
		if (!user.email) {
			skipped += 1;
			continue;
		}

		const successfulPurchaseCount = user.orders.length;
		const lifetimeCompletedSpend = user.orders.reduce(
			(total, order) => total + Number(order.totalAmount || 0),
			0
		);
		const eligible = lifetimeCompletedSpend >= config.unlockThreshold;
		const alreadyActive = user.isAffiliateEnabled || user.affiliatePrograms.length > 0;
		const firstName = getFirstName(user.fullName, user.email);

		if (eligible && !alreadyActive) {
			await maybeSendAffiliateUnlockInvite(user.id);
			skipped += 1;
			continue;
		}
		if (alreadyActive) {
			const program = user.affiliatePrograms[0];
			const isInactiveSharer =
				program &&
				program.status === 'active' &&
				program.totalReferrals === 0 &&
				program.affiliateCode &&
				Date.now() - program.createdAt.getTime() >=
					ACTIVATION_NUDGE_MIN_PROGRAM_AGE_DAYS * 24 * 60 * 60 * 1000;

			if (!isInactiveSharer) {
				skipped += 1;
				continue;
			}

			const cooldownThreshold = new Date(
				Date.now() - ACTIVATION_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
			);
			const recentlyNudged = await prisma.emailNotification.findFirst({
				where: {
					userId: user.id,
					notificationType: 'affiliate_activation_nudge',
					status: 'sent',
					createdAt: { gte: cooldownThreshold }
				},
				select: { id: true }
			});
			if (recentlyNudged) {
				skipped += 1;
				continue;
			}

			const referralLink = `${baseUrl}/ref/${program!.affiliateCode}`;
			const activation = await sendMarketingEmail({
				to: user.email,
				userId: user.id,
				subject: 'Your affiliate code is ready — start earning',
				body: `Hi ${firstName},

You have an affiliate code, but you haven't shared it yet.

Share code ${program!.affiliateCode} with friends and followers. They get a discount at checkout, and you earn real, withdrawable cash on their order.

Your referral link: ${referralLink}`,
				ctaText: 'Share your code',
				ctaUrl: `${baseUrl}/dashboard?tab=affiliate`,
				notificationType: 'affiliate_activation_nudge',
				referenceId: `affiliate_activation_nudge:${user.id}`,
				campaignKey: `affiliate_activation_nudge:${user.id}:${Math.floor(Date.now() / (ACTIVATION_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000))}`
			});
			if (activation.success) sent += 1;
			else if (activation.suppressed) skipped += 1;
			else failed += 1;
			continue;
		}

		if (successfulPurchaseCount >= 2) {
			const remaining = Math.max(0, config.unlockThreshold - lifetimeCompletedSpend);
			const introduction = await sendMarketingEmail({
				to: user.email,
				userId: user.id,
				subject: 'Earn Cash with Fast Accounts referrals',
				body: `Hi ${firstName},

You can earn Cash by referring buyers to Fast Accounts.

Once you unlock affiliate access, you will receive a unique referral code and link. Referred buyers save at checkout, and you earn real, withdrawable Cash from successful referred purchases.

Spend ₦${remaining.toLocaleString('en-US')} more to unlock affiliate access.`,
				ctaText: 'See how affiliate access works',
				ctaUrl: `${baseUrl}/affiliate`,
				notificationType: 'affiliate_introduction',
				referenceId: `affiliate_introduction:${user.id}`,
				campaignKey: `affiliate_introduction:${user.id}`
			});
			if (introduction.success) sent += 1;
			else if (introduction.suppressed) skipped += 1;
			else failed += 1;
		}

		const progressPercent =
			config.unlockThreshold > 0
				? Math.min(100, Math.floor((lifetimeCompletedSpend / config.unlockThreshold) * 100))
				: 100;
		const milestone = PROGRESS_MILESTONES.find((candidate) => progressPercent >= candidate);
		if (!milestone) continue;

		const remaining = Math.max(0, config.unlockThreshold - lifetimeCompletedSpend);
		const progress = await sendMarketingEmail({
			to: user.email,
			userId: user.id,
			subject: 'You are close to affiliate access',
			body: `Hi ${firstName},

You are now ${progressPercent}% of the way to affiliate access.

Spend ₦${remaining.toLocaleString('en-US')} more on successful Fast Accounts orders to unlock your referral code and start earning real, withdrawable Cash.`,
			ctaText: 'View your progress',
			ctaUrl: `${baseUrl}/dashboard?tab=affiliate`,
			notificationType: 'affiliate_progress',
			referenceId: `affiliate_progress:${milestone}:${user.id}`,
			campaignKey: `affiliate_progress:${milestone}:${user.id}`
		});
		if (progress.success) sent += 1;
		else if (progress.suppressed) skipped += 1;
		else failed += 1;
	}

	const [firstCredit, payoutStatus] = await Promise.all([
		recoverFirstStoreCreditEmails(limit),
		recoverAffiliatePayoutStatusEmails(limit)
	]);
	return {
		processed: users.length + firstCredit.processed + payoutStatus.processed,
		sent: sent + firstCredit.sent + payoutStatus.sent,
		skipped,
		failed: failed + firstCredit.failed + payoutStatus.failed,
		firstCredit,
		payoutStatus
	};
}
