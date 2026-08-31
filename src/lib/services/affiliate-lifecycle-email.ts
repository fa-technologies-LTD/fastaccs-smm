import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from '$lib/services/email';
import { getAffiliateConfig, maybeSendAffiliateUnlockInvite } from '$lib/services/affiliate';
import {
	recoverAffiliateBankReadyEmails,
	recoverFirstStoreCreditEmails,
	sendAffiliateUnlockEmailIfNeeded
} from '$lib/services/affiliate-notification-email';
import { recoverAffiliatePayoutStatusEmails } from '$lib/services/affiliate-payout-email';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';

function getBaseUrl(): string {
	return (process.env.PUBLIC_BASE_URL || 'https://smm.fastaccs.com').replace(/\/+$/, '');
}

function getFirstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

// One-time, consent-aware announcement of the refreshed affiliate program. Every
// active affiliate receives the same truthful contract; business logic must never
// depend on a hard-coded list of personal email addresses.

export async function sendAffiliateAnnouncementEmails(): Promise<{
	sent: number;
	skipped: number;
	failed: number;
}> {
	const baseUrl = getBaseUrl();
	const [programs, config] = await Promise.all([
		prisma.affiliateProgram.findMany({
			where: { status: 'active' },
			select: {
				affiliateCode: true,
				createdAt: true,
				user: { select: { id: true, email: true, fullName: true, isActive: true } }
			}
		}),
		getAffiliateConfig()
	]);
	const payoutMinimum = `₦${config.payoutMinimum.toLocaleString()}`;
	let sent = 0;
	let skipped = 0;
	let failed = 0;
	for (const p of programs) {
		const u = p.user;
		if (!u?.email || !u.isActive) {
			skipped += 1;
			continue;
		}
		const referenceId = `affiliate_announcement:${u.id}`;
		const already = await prisma.emailNotification.findFirst({
			where: { referenceId, status: 'sent' },
			select: { id: true }
		});
		if (already) {
			skipped += 1;
			continue;
		}
		const firstName = getFirstName(u.fullName, u.email);
		const link = `${baseUrl}/ref/${p.affiliateCode}`;
		const dash = `${baseUrl}/dashboard?tab=affiliate`;
		const content = {
			subject: 'Your Fast Accounts affiliate code is ready',
			body: `Hi ${firstName},\n\nYour affiliate code: **${p.affiliateCode}**\n\nFriends save 5% on their first two eligible account orders, and you earn 5% too — up to ₦1,000 per order. Cleared earnings can go toward Fast Accounts purchases or be withdrawn from ${payoutMinimum}; payouts are processed on Saturdays.\n\nYour link: ${link}`,
			ctaText: 'View and share my code'
		};
		const result = await sendMarketingEmail({
			to: u.email,
			subject: content.subject,
			body: content.body,
			ctaText: content.ctaText,
			ctaUrl: dash,
			showCta: true,
			userId: u.id,
			notificationType: 'affiliate_unlock',
			campaignKey: 'affiliate_program_2026_announcement',
			referenceId
		});
		if (result.success) sent += 1;
		else if (result.suppressed) skipped += 1;
		else failed += 1;
	}
	return { sent, skipped, failed };
}

export async function runAffiliateLifecycleEmailRecovery(limit = 300): Promise<{
	processed: number;
	sent: number;
	skipped: number;
	failed: number;
	firstCredit: Awaited<ReturnType<typeof recoverFirstStoreCreditEmails>>;
	bankReady: Awaited<ReturnType<typeof recoverAffiliateBankReadyEmails>>;
	payoutStatus: Awaited<ReturnType<typeof recoverAffiliatePayoutStatusEmails>>;
}> {
	const users = await prisma.user.findMany({
		where: {
			isActive: true,
			emailVerified: true,
			email: { not: null },
			userType: { not: 'ADMIN' },
			orders: {
				some: buildRevenueOrderWhere()
			}
		},
		select: {
			id: true,
			email: true,
			isAffiliateEnabled: true,
			affiliatePrograms: {
				select: { id: true },
				take: 1
			},
			orders: {
				where: buildRevenueOrderWhere(),
				select: { id: true }
			}
		},
		orderBy: { registeredAt: 'asc' },
		take: Math.min(Math.max(limit, 1), 1000)
	});

	let sent = 0;
	let skipped = 0;
	let failed = 0;

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
		// Affiliate access is created automatically after the first retained purchase.
		// Recovery only heals missed activation/unlock messages; it deliberately does
		// not send recurring generic marketing nudges.
		if (eligible && !alreadyActive) {
			await maybeSendAffiliateUnlockInvite(user.id);
			skipped += 1;
			continue;
		}
		if (alreadyActive) {
			if (await sendAffiliateUnlockEmailIfNeeded(user.id)) sent += 1;
			else skipped += 1;
			continue;
		}
		skipped += 1;
	}

	const [firstCredit, bankReady, payoutStatus] = await Promise.all([
		recoverFirstStoreCreditEmails(limit),
		recoverAffiliateBankReadyEmails(limit),
		recoverAffiliatePayoutStatusEmails(limit)
	]);
	return {
		processed: users.length + firstCredit.processed + bankReady.processed + payoutStatus.processed,
		sent: sent + firstCredit.sent + bankReady.sent + payoutStatus.sent,
		skipped,
		failed: failed + firstCredit.failed + bankReady.failed + payoutStatus.failed,
		firstCredit,
		bankReady,
		payoutStatus
	};
}
