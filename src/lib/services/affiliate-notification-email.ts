import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import { getRewardVestingDays } from '$lib/services/affiliate-vesting';

const FIRST_CREDIT_PENDING_STALE_MS = 10 * 60 * 1000;
const AFFILIATE_UNLOCK_PENDING_STALE_MS = 10 * 60 * 1000;

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
		subject: 'You earned your first referral reward 🎉',
		body: `Hi ${reservation.firstName},

You earned your first referral reward 🎉

**₦${params.creditAmount.toLocaleString('en-US')}** — clearing now, yours to spend or withdraw in ${vestingDays} days.

Keep sharing your link to earn on every order.`,
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

		const user = await tx.user.findUnique({
			where: { id: userId },
			select: {
				email: true,
				fullName: true,
				isActive: true
			}
		});
		if (!user?.email || !user.isActive) return null;

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
			firstName: getFirstName(user.fullName, user.email)
		};
	});

	if (!reservation) return false;
	const result = await sendEmail({
		to: reservation.email,
		subject: 'You have unlocked affiliate access',
		body: `Hi ${reservation.firstName},

You have unlocked affiliate access on Fast Accounts.

Activate your profile to get your unique referral code and link. Referred buyers save at checkout, and you earn Store Credit from successful referred purchases.

Store Credit is real, withdrawable cash once payout requirements are met.`,
		ctaText: 'Activate affiliate access',
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
