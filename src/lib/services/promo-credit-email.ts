import { prisma } from '$lib/prisma';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import { sendEmail } from '$lib/services/email';

const PENDING_STALE_MS = 15 * 60 * 1000;

function firstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

/**
 * One email per promo credit grant (Refer & Win, BIGSPENDER). The grant's reference makes it
 * once-only: a sent or recently reserved email for the same grant is never sent again. Only ever
 * called when a campaign that the owner switched on issues credit.
 */
export async function sendPromoCreditIssuedEmail(params: {
	userId: string;
	grantReference: string;
	subject: string;
	/** Paragraphs after "Hi <name>,". */
	body: string;
}): Promise<boolean> {
	const referenceId = `promo_credit:${params.grantReference}`;
	const reservation = await prisma.$transaction(async (tx) => {
		const locked = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id FROM users WHERE id = ${params.userId}::uuid FOR UPDATE
		`;
		if (locked.length === 0) return null;
		const existing = await tx.emailNotification.findFirst({
			where: { userId: params.userId, referenceId, status: { in: ['pending', 'sent'] } },
			orderBy: { createdAt: 'desc' },
			select: { status: true, createdAt: true }
		});
		if (existing?.status === 'sent') return null;
		if (existing && Date.now() - existing.createdAt.getTime() < PENDING_STALE_MS) return null;
		const user = await tx.user.findUnique({
			where: { id: params.userId },
			select: { email: true, fullName: true, isActive: true }
		});
		if (!user?.email || !user.isActive) return null;
		const notification = await tx.emailNotification.create({
			data: {
				userId: params.userId,
				email: user.email.toLowerCase(),
				notificationType: 'promo_credit',
				classification: 'transactional',
				referenceId,
				status: 'pending'
			},
			select: { id: true }
		});
		return {
			notificationId: notification.id,
			email: user.email,
			name: firstName(user.fullName, user.email)
		};
	});
	if (!reservation) return false;
	const result = await sendEmail({
		to: reservation.email,
		subject: params.subject,
		body: `Hi ${reservation.name},\n\n${params.body}`,
		ctaText: 'Shop now',
		ctaUrl: getSiteBaseUrl(),
		userId: params.userId,
		notificationType: 'promo_credit',
		classification: 'transactional',
		referenceId,
		notificationId: reservation.notificationId
	});
	return result.success;
}
