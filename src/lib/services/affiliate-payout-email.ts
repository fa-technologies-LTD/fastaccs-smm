import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';

type PayoutEmailStatus = 'requested' | 'paid' | 'reversed';

const PAYOUT_EMAIL_PENDING_STALE_MS = 10 * 60 * 1000;

function getBaseUrl(): string {
	return (process.env.PUBLIC_BASE_URL || 'https://smm.fastaccs.com').replace(/\/+$/, '');
}

function getFirstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

function getPayoutEmailContent(params: {
	status: PayoutEmailStatus;
	firstName: string;
	amount: number;
	reference: string;
	adminNotes?: string;
}): {
	subject: string;
	body: string;
	ctaText: string;
} {
	const amount = `₦${params.amount.toLocaleString('en-US')}`;

	if (params.status === 'requested') {
		return {
			subject: 'Your Store Credit payout request was received',
			body: `Hi ${params.firstName},

We received your Store Credit payout request.

Requested amount: ${amount}
Request reference: ${params.reference}

We will review it and update the status in your affiliate dashboard.`,
			ctaText: 'View payout status'
		};
	}

	if (params.status === 'paid') {
		return {
			subject: 'Your Store Credit payout is complete',
			body: `Hi ${params.firstName},

Your Store Credit payout has been completed.

Amount paid: ${amount}
Request reference: ${params.reference}

Thank you for growing with Fast Accounts.`,
			ctaText: 'View affiliate dashboard'
		};
	}

	return {
		subject: 'Update on your Store Credit payout request',
		body: `Hi ${params.firstName},

Your Store Credit payout request could not be approved.

Requested amount: ${amount}
Request reference: ${params.reference}
Reason: ${params.adminNotes || 'The request did not pass review.'}

Your affiliate dashboard shows the latest status. Contact support if you need help.`,
		ctaText: 'View payout status'
	};
}

export async function sendAffiliatePayoutStatusEmailIfNeeded(params: {
	payoutTransactionId: string;
	expectedStatus?: string;
}): Promise<boolean> {
	const reservation = await prisma.$transaction(async (tx) => {
		const lockedTransactions = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM wallet_transactions
			WHERE id = ${params.payoutTransactionId}::uuid
			FOR UPDATE
		`;
		if (lockedTransactions.length === 0) return null;

		const payout = await tx.walletTransaction.findUnique({
			where: { id: params.payoutTransactionId },
			select: {
				id: true,
				type: true,
				status: true,
				amount: true,
				reference: true,
				userId: true,
				metadata: true,
				user: {
					select: {
						email: true,
						fullName: true,
						isActive: true
					}
				}
			}
		});
		const status = String(payout?.status || '').toLowerCase();
		if (!payout || payout.type !== 'affiliate_payout') return null;
		if (params.expectedStatus && status !== params.expectedStatus.toLowerCase()) return null;
		if (!['requested', 'paid', 'reversed'].includes(status)) return null;
		if (!payout.user?.email || !payout.user.isActive) return null;

		const typedStatus = status as PayoutEmailStatus;
		const metadata =
			payout.metadata && typeof payout.metadata === 'object' && !Array.isArray(payout.metadata)
				? (payout.metadata as Record<string, unknown>)
				: {};
		const adminNotes =
			typeof metadata.adminNotes === 'string' && metadata.adminNotes.trim()
				? metadata.adminNotes.trim()
				: undefined;
		const referenceId = `affiliate_payout:${payout.id}:${typedStatus}`;
		const existing = await tx.emailNotification.findFirst({
			where: {
				referenceId,
				notificationType: 'affiliate_payout',
				status: { in: ['pending', 'sent'] }
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true, status: true, createdAt: true }
		});
		if (existing?.status === 'sent') return null;
		if (
			existing?.status === 'pending' &&
			Date.now() - existing.createdAt.getTime() < PAYOUT_EMAIL_PENDING_STALE_MS
		) {
			return null;
		}

		const notification = await tx.emailNotification.create({
			data: {
				userId: payout.userId,
				email: payout.user.email.toLowerCase(),
				notificationType: 'affiliate_payout',
				classification: 'transactional',
				referenceId,
				status: 'pending'
			},
			select: { id: true }
		});

		return {
			notificationId: notification.id,
			userId: payout.userId,
			email: payout.user.email,
			firstName: getFirstName(payout.user.fullName, payout.user.email),
			amount: Number(payout.amount || 0),
			reference: payout.reference || payout.id,
			status: typedStatus,
			referenceId,
			adminNotes
		};
	});

	if (!reservation) return false;
	const content = getPayoutEmailContent(reservation);
	const result = await sendEmail({
		to: reservation.email,
		userId: reservation.userId,
		subject: content.subject,
		body: content.body,
		ctaText: content.ctaText,
		ctaUrl: `${getBaseUrl()}/dashboard?tab=affiliate`,
		notificationType: 'affiliate_payout',
		referenceId: reservation.referenceId,
		notificationId: reservation.notificationId
	});
	return result.success;
}

export async function recoverAffiliatePayoutStatusEmails(limit = 300): Promise<{
	processed: number;
	sent: number;
	failed: number;
}> {
	const payouts = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_payout',
			status: { in: ['requested', 'paid', 'reversed'] },
			user: {
				isActive: true,
				email: { not: null }
			}
		},
		select: {
			id: true,
			status: true
		},
		orderBy: { createdAt: 'asc' },
		take: Math.min(Math.max(limit, 1), 1000)
	});

	let sent = 0;
	let failed = 0;
	for (const payout of payouts) {
		try {
			if (
				await sendAffiliatePayoutStatusEmailIfNeeded({
					payoutTransactionId: payout.id,
					expectedStatus: payout.status
				})
			) {
				sent += 1;
			}
		} catch {
			failed += 1;
		}
	}

	return {
		processed: payouts.length,
		sent,
		failed
	};
}
