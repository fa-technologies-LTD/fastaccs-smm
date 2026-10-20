import { prisma } from '$lib/prisma';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import { sendEmail } from '$lib/services/email';
import { getFirstOrderOffer } from '$lib/services/promotions';

/**
 * Accounts that never confirmed their email can't check out and get no marketing. They get at
 * most two reminders (a day after sign-up, then a week later) pointing to the verify page, only on
 * mainstream mail providers: throwaway domains from bot sign-ups would bounce and hurt delivery
 * for everyone else.
 */

const COMMON_PROVIDERS = new Set([
	'gmail.com',
	'googlemail.com',
	'yahoo.com',
	'yahoo.co.uk',
	'ymail.com',
	'rocketmail.com',
	'hotmail.com',
	'hotmail.co.uk',
	'outlook.com',
	'live.com',
	'msn.com',
	'icloud.com',
	'me.com',
	'aol.com',
	'proton.me',
	'protonmail.com'
]);
const FIRST_AFTER_DAYS = 1;
const SECOND_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export function isLikelyRealMailbox(email: string | null | undefined): boolean {
	const domain = String(email ?? '')
		.trim()
		.toLowerCase()
		.split('@')[1];
	if (!domain) return false;
	return COMMON_PROVIDERS.has(domain) || domain.endsWith('.ng');
}

export function verificationReminderContent(
	step: 1 | 2,
	firstName: string,
	offerLabel: string | null
): { subject: string; body: string } {
	const offer = offerLabel ? `\n\nOnce you're in: **${offerLabel}**, one tap at checkout.` : '';
	const ignore = "\n\nIf you didn't create this account, you can ignore this email.";
	return step === 1
		? {
				subject: 'Confirm your email to start shopping',
				body: `Hi ${firstName},\n\nYou created a Fast Accounts account but haven't confirmed your email yet, so checkout is locked for now. It takes about 30 seconds: tap below, sign in, and we'll email you a code.${offer}${ignore}`
			}
		: {
				subject: 'Last reminder: confirm your email',
				body: `Hi ${firstName},\n\nOne quick step left before you can order: confirm your email. Tap below, sign in and enter the code we send you.${offer}${ignore}`
			};
}

export async function runVerificationReminders(
	options: { now?: Date; limit?: number; dryRun?: boolean } = {}
): Promise<{ eligible: number; sent: number; skipped: number; byStep: Record<1 | 2, number> }> {
	const now = options.now ?? new Date();
	const limit = options.limit ?? 150;
	const users = await prisma.user.findMany({
		where: {
			userType: 'REGISTERED',
			isActive: true,
			emailVerified: false,
			email: { not: null },
			marketingUnsubscribedAt: null,
			marketingSuppressedAt: null,
			registeredAt: { lte: new Date(now.getTime() - FIRST_AFTER_DAYS * DAY_MS) }
		},
		select: { id: true, email: true, fullName: true },
		orderBy: { registeredAt: 'desc' },
		take: 2_000
	});
	const candidates = users.filter((user) => isLikelyRealMailbox(user.email));
	const sentRows = candidates.length
		? await prisma.emailNotification.findMany({
				where: {
					userId: { in: candidates.map((user) => user.id) },
					notificationType: 'verification_reminder',
					status: 'sent'
				},
				select: { userId: true, sentAt: true, createdAt: true }
			})
		: [];
	const history = new Map<string, Date[]>();
	for (const row of sentRows) {
		if (!row.userId) continue;
		history.set(row.userId, [...(history.get(row.userId) ?? []), row.sentAt ?? row.createdAt]);
	}

	const byStep: Record<1 | 2, number> = { 1: 0, 2: 0 };
	let sent = 0;
	let skipped = 0;
	let eligible = 0;
	const baseUrl = getSiteBaseUrl();
	for (const user of candidates) {
		const previous = (history.get(user.id) ?? []).sort((a, b) => a.getTime() - b.getTime());
		const step: 1 | 2 | null =
			previous.length === 0
				? 1
				: previous.length === 1 &&
					  now.getTime() - previous[0].getTime() >= SECOND_AFTER_DAYS * DAY_MS
					? 2
					: null;
		if (!step || !user.email) continue;
		eligible += 1;
		if (options.dryRun || sent >= limit) {
			byStep[step] += 1;
			continue;
		}
		const offer = await getFirstOrderOffer(user.id).catch(() => null);
		const name = user.fullName?.trim().split(/\s+/)[0] || user.email.split('@')[0] || 'there';
		const content = verificationReminderContent(step, name, offer?.label ?? null);
		const result = await sendEmail({
			to: user.email,
			subject: content.subject,
			body: content.body,
			ctaText: 'Confirm my email',
			ctaUrl: `${baseUrl}/verify-email`,
			userId: user.id,
			notificationType: 'verification_reminder',
			classification: 'transactional',
			referenceId: `verify-reminder:step_${step}:${user.id}`
		}).catch(() => ({ success: false }));
		if (result.success) {
			sent += 1;
			byStep[step] += 1;
		} else skipped += 1;
	}
	return { eligible, sent, skipped, byStep };
}
