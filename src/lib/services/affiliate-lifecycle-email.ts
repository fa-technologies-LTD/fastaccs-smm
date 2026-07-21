import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from '$lib/services/email';
import {
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
			affiliatePayoutDetails: { select: { id: true } },
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
		// Access unlocks on the FIRST completed purchase. Every user in this query
		// already has >=1 paid order, so all are eligible.
		const eligible = successfulPurchaseCount > 0;
		const alreadyActive = user.isAffiliateEnabled || user.affiliatePrograms.length > 0;
		const firstName = getFirstName(user.fullName, user.email);
		const cooldownStart = new Date(Date.now() - ACTIVATION_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
		const cooldownBucket = Math.floor(Date.now() / (ACTIVATION_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000));

		// Eligible but not yet an affiliate -> invite them to claim their code.
		if (eligible && !alreadyActive) {
			await maybeSendAffiliateUnlockInvite(user.id);
			skipped += 1;
			continue;
		}
		if (!alreadyActive) {
			skipped += 1;
			continue;
		}

		const program = user.affiliatePrograms[0];
		const agedEnough = Boolean(
			program &&
				program.status === 'active' &&
				program.affiliateCode &&
				Date.now() - program.createdAt.getTime() >=
					ACTIVATION_NUDGE_MIN_PROGRAM_AGE_DAYS * 24 * 60 * 60 * 1000
		);
		if (!program || !agedEnough) {
			skipped += 1;
			continue;
		}

		const hasBankDetails = Boolean(user.affiliatePayoutDetails);
		const hasStartedEarning = program.totalReferrals > 0;
		const referralLink = `${baseUrl}/ref/${program.affiliateCode}`;

		// Earning but no bank details yet -> nudge them to get payout-ready.
		if (hasStartedEarning && !hasBankDetails) {
			const recentlyNudged = await prisma.emailNotification.findFirst({
				where: {
					userId: user.id,
					notificationType: 'affiliate_bank_details_nudge',
					status: 'sent',
					createdAt: { gte: cooldownStart }
				},
				select: { id: true }
			});
			if (recentlyNudged) {
				skipped += 1;
				continue;
			}
			const bank = await sendMarketingEmail({
				to: user.email,
				userId: user.id,
				subject: "You're earning — add your bank details to get paid",
				body: `Hi ${firstName},\n\nYour referrals are earning you cash 🎉\n\nAdd your bank details now so your withdrawal is ready the moment you reach ₦10,000. It takes a minute — we handle the rest.\n\nYour referral link: ${referralLink}`,
				ctaText: 'Add bank details',
				ctaUrl: `${baseUrl}/dashboard?tab=affiliate`,
				notificationType: 'affiliate_bank_details_nudge',
				referenceId: `affiliate_bank_details_nudge:${user.id}`,
				campaignKey: `affiliate_bank_details_nudge:${user.id}:${cooldownBucket}`
			});
			if (bank.success) sent += 1;
			else if (bank.suppressed) skipped += 1;
			else failed += 1;
			continue;
		}

		// Active but not sharing yet (no referrals) -> nudge to share the code.
		if (!hasStartedEarning) {
			const recentlyNudged = await prisma.emailNotification.findFirst({
				where: {
					userId: user.id,
					notificationType: 'affiliate_activation_nudge',
					status: 'sent',
					createdAt: { gte: cooldownStart }
				},
				select: { id: true }
			});
			if (recentlyNudged) {
				skipped += 1;
				continue;
			}
			const activation = await sendMarketingEmail({
				to: user.email,
				userId: user.id,
				subject: 'Your affiliate code is ready — start earning',
				body: `Hi ${firstName},\n\nYou have an affiliate code, but you haven't shared it yet.\n\nShare code ${program.affiliateCode} with friends and followers. They get a discount at checkout, and you earn real, withdrawable cash on their order.\n\nYour referral link: ${referralLink}`,
				ctaText: 'Share your code',
				ctaUrl: `${baseUrl}/dashboard?tab=affiliate`,
				notificationType: 'affiliate_activation_nudge',
				referenceId: `affiliate_activation_nudge:${user.id}`,
				campaignKey: `affiliate_activation_nudge:${user.id}:${cooldownBucket}`
			});
			if (activation.success) sent += 1;
			else if (activation.suppressed) skipped += 1;
			else failed += 1;
			continue;
		}

		// Active, earning, and payout-ready -> nothing to nudge.
		skipped += 1;
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
