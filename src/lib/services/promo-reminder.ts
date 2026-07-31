import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from './email';
import { getSiteBaseUrl } from '$lib/helpers/site-url';

/**
 * "Your ₦1,000 is still unlocked" reminder — sent only to customers who hold a
 * personal, unlocked, still-unused promo code (spend-milestone rewards). One reminder
 * per code (deduped by referenceId), personalised with the customer's own code.
 * Promo codes apply to ACCOUNT purchases only.
 */

const NOTIFICATION_TYPE = 'promo_reminder' as const;
const CAMPAIGN_KEY = 'promo-reminder';

function reminderReference(codeId: string): string {
	return `promo-reminder:${codeId}`;
}

interface ReminderCopy {
	subject: string;
	body: string;
	ctaText: string;
}

function buildCopy(firstName: string, code: string, amountNgn: number, minNgn: number): ReminderCopy {
	const amount = Math.round(amountNgn).toLocaleString();
	const min = Math.round(minNgn).toLocaleString();
	return {
		subject: `Don't let your ₦${amount} expire`,
		body: `Hi ${firstName},

You unlocked a reward and it's still sitting in your account: ₦${amount} off your next order.

Your code: ${code}
• ₦${amount} off any account order from ₦${min}
• One tap at checkout — no fuss

Grab an account while it's live — this one won't stick around.`,
		ctaText: `Use my ₦${amount}`
	};
}

/**
 * Queue reminder emails to eligible code-holders who haven't been reminded yet.
 * Returns how many were queued vs skipped. Safe to run repeatedly (idempotent per code).
 */
export async function sendPromoReminderEmails(limit = 300): Promise<{ sent: number; skipped: number }> {
	const now = new Date();
	const baseUrl = getSiteBaseUrl();

	// Unlocked (issued to a user), active, unused, not expired.
	const codes = await prisma.promotionCode.findMany({
		where: {
			issuedToUserId: { not: null },
			isActive: true,
			usageCount: 0,
			OR: [{ endsAt: null }, { endsAt: { gt: now } }]
		},
		select: { id: true, code: true, value: true, minOrderValue: true, issuedToUserId: true },
		take: limit * 4
	});
	if (codes.length === 0) return { sent: 0, skipped: 0 };

	const alreadyRows = await prisma.emailNotification.findMany({
		where: {
			notificationType: NOTIFICATION_TYPE,
			referenceId: { in: codes.map((c) => reminderReference(c.id)) }
		},
		select: { referenceId: true }
	});
	const already = new Set(alreadyRows.map((r) => r.referenceId));

	const userIds = [...new Set(codes.map((c) => c.issuedToUserId!))];
	const users = new Map(
		(
			await prisma.user.findMany({
				where: {
					id: { in: userIds },
					isActive: true,
					marketingUnsubscribedAt: null,
					email: { not: '' }
				},
				select: { id: true, email: true, fullName: true }
			})
		).map((u) => [u.id, u])
	);

	let sent = 0;
	let skipped = 0;
	for (const c of codes) {
		if (sent >= limit) break;
		if (already.has(reminderReference(c.id))) {
			skipped += 1;
			continue;
		}
		const user = users.get(c.issuedToUserId!);
		if (!user?.email) {
			skipped += 1;
			continue;
		}
		const firstName = (user.fullName || '').trim().split(/\s+/)[0] || 'there';
		const copy = buildCopy(firstName, c.code, Number(c.value), Number(c.minOrderValue));
		const result = await sendMarketingEmail({
			to: user.email,
			subject: copy.subject,
			body: copy.body,
			ctaText: copy.ctaText,
			ctaUrl: `${baseUrl}/platforms`,
			userId: user.id,
			notificationType: NOTIFICATION_TYPE,
			referenceId: reminderReference(c.id),
			campaignKey: CAMPAIGN_KEY
		});
		if (result.success) sent += 1;
		else skipped += 1;
	}
	return { sent, skipped };
}

/**
 * Send a single preview to one address so an admin can see the email. Uses the
 * recipient's real unlocked code if they have one, otherwise a sample code. A unique
 * referenceId keeps it out of the real per-code dedup.
 */
export async function sendPromoReminderPreview(email: string): Promise<{ ok: boolean; reason?: string }> {
	const baseUrl = getSiteBaseUrl();
	const user = await prisma.user.findFirst({
		where: { email },
		select: { id: true, email: true, fullName: true }
	});
	if (!user) return { ok: false, reason: 'user not found' };
	if (!user.email) return { ok: false, reason: 'user has no email' };

	const own = await prisma.promotionCode.findFirst({
		where: { issuedToUserId: user.id, isActive: true, usageCount: 0 },
		select: { code: true, value: true, minOrderValue: true }
	});
	const firstName = (user.fullName || '').trim().split(/\s+/)[0] || 'there';
	const copy = buildCopy(
		firstName,
		own?.code ?? 'SPEND8K-SAMPLE',
		own ? Number(own.value) : 1000,
		own ? Number(own.minOrderValue) : 2000
	);
	const result = await sendMarketingEmail({
		to: user.email,
		subject: `[Preview] ${copy.subject}`,
		body: copy.body,
		ctaText: copy.ctaText,
		ctaUrl: `${baseUrl}/platforms`,
		userId: user.id,
		notificationType: NOTIFICATION_TYPE,
		referenceId: `promo-reminder-preview:${user.id}:${Date.now()}`,
		campaignKey: CAMPAIGN_KEY
	});
	return { ok: result.success === true, reason: result.suppressionReason ?? undefined };
}
