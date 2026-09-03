import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import { getRewardVestingDays } from '$lib/services/affiliate-vesting';

const FIRST_CREDIT_PENDING_STALE_MS = 10 * 60 * 1000;
const AFFILIATE_UNLOCK_PENDING_STALE_MS = 10 * 60 * 1000;
const PAYOUT_MINIMUM_KEY = 'config.affiliate.payout_minimum';
const DEFAULT_PAYOUT_MINIMUM = 10_000;

function parsePayoutMinimum(value: string | null | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : DEFAULT_PAYOUT_MINIMUM;
}

function getBaseUrl(): string {
	return (process.env.PUBLIC_BASE_URL || 'https://smm.fastaccs.com').replace(/\/+$/, '');
}

function getFirstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

export async function sendFirstStoreCreditEmailIfNeeded(params: {
	userId: string;
	creditAmount: number;
}): Promise<boolean> {
	const reservation = await prisma.$transaction(async (tx) => {
		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM users
			WHERE id = ${params.userId}::uuid
			FOR UPDATE
		`;
		if (lockedUsers.length === 0) return null;

		const existing = await tx.emailNotification.findFirst({
			where: {
				userId: params.userId,
				notificationType: 'affiliate_store_credit',
				status: { in: ['pending', 'sent'] }
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, createdAt: true }
		});
		if (existing?.status === 'sent') return null;
		if (
			existing?.status === 'pending' &&
			Date.now() - existing.createdAt.getTime() < FIRST_CREDIT_PENDING_STALE_MS
		) {
			return null;
		}

		const user = await tx.user.findUnique({
			where: { id: params.userId },
			select: {
				email: true,
				fullName: true,
				isActive: true
			}
		});
		if (!user?.email || !user.isActive) return null;

		const notification = await tx.emailNotification.create({
			data: {
				userId: params.userId,
				email: user.email.toLowerCase(),
				notificationType: 'affiliate_store_credit',
				classification: 'transactional',
				referenceId: `affiliate_first_credit:${params.userId}`,
				status: 'pending'
			},
			select: { id: true }
		});

		return {
			notificationId: notification.id,
			email: user.email,
			firstName: getFirstName(user.fullName, user.email)
		};
	});

	if (!reservation) return false;

	const vestingDays = await getRewardVestingDays();

	const result = await sendEmail({
		to: reservation.email,
		subject: 'Your first referral reward is pending 🎉',
		body: `Hi ${reservation.firstName},

Your first referral reward has been recorded 🎉

**₦${params.creditAmount.toLocaleString('en-US')}** is pending. If the referred order remains retained, it clears for spending or withdrawal after the ${vestingDays}-day return window.

Keep sharing your link. You earn 5% on each referred friend's first two eligible account orders, up to ₦1,000 per order.`,
		ctaText: 'View affiliate dashboard',
		ctaUrl: `${getBaseUrl()}/dashboard?tab=affiliate`,
		userId: params.userId,
		notificationType: 'affiliate_store_credit',
		referenceId: `affiliate_first_credit:${params.userId}`,
		notificationId: reservation.notificationId
	});

	return result.success;
}

export async function sendAffiliateUnlockEmailIfNeeded(userId: string): Promise<boolean> {
	const reservation = await prisma.$transaction(async (tx) => {
		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM users
			WHERE id = ${userId}::uuid
			FOR UPDATE
		`;
		if (lockedUsers.length === 0) return null;

		const existing = await tx.emailNotification.findFirst({
			where: {
				userId,
				notificationType: 'affiliate_unlock',
				status: { in: ['pending', 'sent'] }
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, createdAt: true }
		});
		if (existing?.status === 'sent') return null;
		if (
			existing?.status === 'pending' &&
			Date.now() - existing.createdAt.getTime() < AFFILIATE_UNLOCK_PENDING_STALE_MS
		) {
			return null;
		}

		const [user, payoutSetting] = await Promise.all([
			tx.user.findUnique({
				where: { id: userId },
				select: {
					email: true,
					fullName: true,
					isActive: true,
					affiliatePrograms: {
						where: { status: 'active' },
						select: { affiliateCode: true },
						take: 1
					}
				}
			}),
			tx.microcopy.findUnique({ where: { key: PAYOUT_MINIMUM_KEY }, select: { value: true } })
		]);
		const affiliateCode = user?.affiliatePrograms?.[0]?.affiliateCode;
		if (!user?.email || !user.isActive || !affiliateCode) return null;

		const notification = await tx.emailNotification.create({
			data: {
				userId,
				email: user.email.toLowerCase(),
				notificationType: 'affiliate_unlock',
				classification: 'transactional',
				referenceId: `affiliate_unlock:${userId}`,
				status: 'pending'
			},
			select: { id: true }
		});

		return {
			notificationId: notification.id,
			email: user.email,
			firstName: getFirstName(user.fullName, user.email),
			affiliateCode,
			payoutMinimum: parsePayoutMinimum(payoutSetting?.value)
		};
	});

	if (!reservation) return false;
	const result = await sendEmail({
		to: reservation.email,
		subject: 'Your Fast Accounts affiliate code is ready',
		body: `Hi ${reservation.firstName},

Your affiliate code is ready: **${reservation.affiliateCode}**

Share it with people who need social-media accounts. They save 5% on their first two eligible account orders, and you earn 5% too — up to ₦1,000 per order.

Your cleared earnings can be spent on Fast Accounts or withdrawn from ₦${reservation.payoutMinimum.toLocaleString()}. Payouts are processed on Saturdays.`,
		ctaText: 'View and share my code',
		ctaUrl: `${getBaseUrl()}/dashboard?tab=affiliate`,
		notificationType: 'affiliate_unlock',
		userId,
		referenceId: `affiliate_unlock:${userId}`,
		notificationId: reservation.notificationId
	});

	return result.success;
}

export async function recoverFirstStoreCreditEmails(limit = 300): Promise<{
	processed: number;
	sent: number;
	failed: number;
}> {
	const credits = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_credit',
			// Rewards land as `pending` (vesting) — recovery must see those too, since the
			// first-reward email fires at earn time, not at vest time.
			status: { in: ['pending', 'available'] },
			user: {
				isActive: true,
				email: { not: null }
			}
		},
		select: {
			userId: true,
			amount: true
		},
		orderBy: { createdAt: 'asc' },
		distinct: ['userId'],
		take: Math.min(Math.max(limit, 1), 1000)
	});

	let sent = 0;
	let failed = 0;
	for (const credit of credits) {
		try {
			if (
				await sendFirstStoreCreditEmailIfNeeded({
					userId: credit.userId,
					creditAmount: Number(credit.amount || 0)
				})
			) {
				sent += 1;
			}
		} catch {
			failed += 1;
		}
	}

	return {
		processed: credits.length,
		sent,
		failed
	};
}

export async function sendAffiliateBankReadyEmailIfNeeded(userId: string): Promise<boolean> {
	const reservation = await prisma.$transaction(async (tx) => {
		const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE
		`;
		if (lockedUsers.length === 0) return null;

		const existing = await tx.emailNotification.findFirst({
			where: {
				userId,
				notificationType: 'affiliate_bank_details_nudge',
				status: { in: ['pending', 'sent'] }
			},
			select: { id: true }
		});
		if (existing) return null;

		const [user, payoutSetting] = await Promise.all([
			tx.user.findUnique({
				where: { id: userId },
				select: {
					email: true,
					fullName: true,
					isActive: true,
					isAffiliateEnabled: true,
					affiliatePrograms: {
						where: { status: 'active' },
						select: { id: true },
						take: 1
					},
					affiliatePayoutDetails: { select: { id: true } }
				}
			}),
			tx.microcopy.findUnique({ where: { key: PAYOUT_MINIMUM_KEY }, select: { value: true } })
		]);
		if (
			!user?.email ||
			!user.isActive ||
			!user.isAffiliateEnabled ||
			user.affiliatePrograms.length === 0 ||
			user.affiliatePayoutDetails
		) {
			return null;
		}

		const notification = await tx.emailNotification.create({
			data: {
				userId,
				email: user.email.toLowerCase(),
				notificationType: 'affiliate_bank_details_nudge',
				classification: 'transactional',
				referenceId: `affiliate_bank_ready:${userId}`,
				status: 'pending'
			},
			select: { id: true }
		});
		return {
			notificationId: notification.id,
			email: user.email,
			firstName: getFirstName(user.fullName, user.email),
			payoutMinimum: parsePayoutMinimum(payoutSetting?.value)
		};
	});

	if (!reservation) return false;
	const result = await sendEmail({
		to: reservation.email,
		subject: 'Your first referral earning is now available',
		body: `Hi ${reservation.firstName},

Your first referral earning has cleared and is now available.

You can spend cleared earnings on Fast Accounts, or add approved bank details and request a payout once your available balance reaches ₦${reservation.payoutMinimum.toLocaleString()}. Payouts are processed on Saturdays.`,
		ctaText: 'Add bank details',
		ctaUrl: `${getBaseUrl()}/affiliate/bank-details`,
		userId,
		notificationType: 'affiliate_bank_details_nudge',
		classification: 'transactional',
		referenceId: `affiliate_bank_ready:${userId}`,
		notificationId: reservation.notificationId
	});
	return result.success;
}

export async function recoverAffiliateBankReadyEmails(limit = 300): Promise<{
	processed: number;
	sent: number;
	failed: number;
}> {
	const affiliates = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_credit',
			status: 'available',
			user: {
				isActive: true,
				isAffiliateEnabled: true,
				email: { not: null },
				affiliatePrograms: { some: { status: 'active' } },
				affiliatePayoutDetails: null
			}
		},
		select: { userId: true },
		orderBy: { createdAt: 'asc' },
		distinct: ['userId'],
		take: Math.min(Math.max(limit, 1), 1000)
	});

	let sent = 0;
	let failed = 0;
	for (const affiliate of affiliates) {
		try {
			if (await sendAffiliateBankReadyEmailIfNeeded(affiliate.userId)) sent += 1;
		} catch {
			failed += 1;
		}
	}
	return { processed: affiliates.length, sent, failed };
}
