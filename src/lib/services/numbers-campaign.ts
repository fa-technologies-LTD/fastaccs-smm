import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from '$lib/services/email';
import { sendPushToUsers } from '$lib/services/push-notifications';
import { saveAnnouncementBannerConfig } from '$lib/services/announcement-banner';
import { getNumbersPlatformId } from '$lib/services/phone-catalog';
import { getSiteBaseUrl } from '$lib/helpers/site-url';

/**
 * Numbers discovery campaign. The owner switch enables a paced three-message
 * sequence for opted-in customers who have not bought a number. New customers
 * become eligible after five days; later messages wait seven and fourteen days.
 * A Numbers purchase immediately stops the remaining sequence.
 */

const CAMPAIGN_KEY = 'config.numbers_launch_campaign';
const ANNOUNCEMENT_FLAG_KEY = 'feature.admin_announcement_banner.enabled';
const MANUAL_PHONE_PLATFORM = 'Foreign Phone Numbers';

const FIRST_TOUCH_ACCOUNT_AGE_DAYS = 5;
const TOUCH_GAPS_DAYS = [0, 7, 14] as const;

export interface NumbersCampaignState {
	enabled: boolean;
	launchedAt: string | null;
}

// ---- Copy (Speed hook) -----------------------------------------------------

export const NUMBERS_LAUNCH_BANNER_TEXT =
	'Instant verification numbers for WhatsApp, Telegram, Google & more — get your one-time code in seconds.';

export const NUMBERS_LAUNCH_POPUP = {
	icon: '⚡',
	title: 'Verification codes, in seconds',
	body: 'New: instant phone numbers for WhatsApp, Telegram, Google & more. Buy a number, get your one-time code automatically. No code? Instant refund.',
	ctaText: 'Maybe later',
	secondaryHref: '/numbers',
	secondaryText: 'Get a number →'
};

const PUSH_PAYLOAD = {
	title: 'Instant verification numbers are here ⚡',
	body: 'Get your one-time code in seconds — WhatsApp, Telegram, Google & more.',
	url: '/numbers'
};

interface TouchCopy {
	subject: string;
	body: string;
	ctaText: string;
}

const TOUCH_COPY: Record<number, TouchCopy> = {
	1: {
		subject: 'Verification numbers for the apps you use ⚡',
		body: `Get verification numbers for WhatsApp and Telegram across the USA, UK, and more countries. Pick what you need and your one-time code appears on your order page.

No code within the activation window? You are refunded automatically.`,
		ctaText: 'Get a number'
	},
	2: {
		subject: 'WhatsApp and Telegram numbers, ready when you need them',
		body: `Choose WhatsApp or Telegram, select the USA, UK, or another available country, and receive your code automatically.

It is self-serve and available 24/7. If no code arrives, you are refunded automatically.`,
		ctaText: 'See available numbers'
	},
	3: {
		subject: 'Need a number for WhatsApp or Telegram?',
		body: `USA and UK options are available alongside other countries. Pick a number, request your code, done.

No code within the activation window? You are refunded automatically.`,
		ctaText: 'Try Numbers'
	}
};

// ---- State -----------------------------------------------------------------

export async function getNumbersCampaignState(): Promise<NumbersCampaignState> {
	const row = await prisma.microcopy.findUnique({ where: { key: CAMPAIGN_KEY } });
	if (!row?.value) return { enabled: false, launchedAt: null };
	try {
		const parsed = JSON.parse(row.value) as Partial<NumbersCampaignState>;
		return { enabled: Boolean(parsed.enabled), launchedAt: parsed.launchedAt ?? null };
	} catch {
		return { enabled: false, launchedAt: null };
	}
}

async function setCampaignState(state: NumbersCampaignState): Promise<void> {
	await prisma.microcopy.upsert({
		where: { key: CAMPAIGN_KEY },
		update: { value: JSON.stringify(state), category: 'settings', isActive: true },
		create: {
			key: CAMPAIGN_KEY,
			value: JSON.stringify(state),
			category: 'settings',
			description: 'Numbers discovery campaign state (enabled, launchedAt).',
			isActive: true
		}
	});
}

/** Days elapsed since launch, retained for the short-lived launch popup only. */
export function daysSinceLaunch(state: NumbersCampaignState, now = Date.now()): number | null {
	if (!state.launchedAt) return null;
	return Math.floor((now - new Date(state.launchedAt).getTime()) / 86_400_000);
}

// ---- Cutover (retire manual phone tiers) -----------------------------------

async function setManualPhoneTiersActive(active: boolean): Promise<number> {
	const platform = await prisma.category.findFirst({
		where: {
			name: { contains: MANUAL_PHONE_PLATFORM, mode: 'insensitive' },
			categoryType: 'platform'
		},
		select: { id: true }
	});
	if (!platform) return 0;
	const res = await prisma.category.updateMany({
		where: { parentId: platform.id },
		data: { isActive: active }
	});
	return res.count;
}

export const retireManualPhoneTiers = () => setManualPhoneTiersActive(false);
export const restoreManualPhoneTiers = () => setManualPhoneTiersActive(true);

// ---- Suppression -----------------------------------------------------------

/** User ids (within `userIds`) who have already bought a number — suppress them. */
async function numberBuyerIds(userIds: string[]): Promise<Set<string>> {
	if (userIds.length === 0) return new Set();
	const rows = await prisma.order.findMany({
		where: {
			userId: { in: userIds },
			orderType: 'phone',
			status: { in: ['paid', 'processing', 'completed'] }
		},
		select: { userId: true }
	});
	return new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)));
}

// ---- Email touches ---------------------------------------------------------

function touchReference(touch: number, userId: string): string {
	return `numbers-launch:t${touch}:${userId}`;
}

/** Send one touch's email to eligible users who haven't received it yet. */
async function sendTouchEmails(
	touch: number,
	limit: number
): Promise<{ sent: number; skipped: number }> {
	const copy = TOUCH_COPY[touch];
	if (!copy) return { sent: 0, skipped: 0 };
	const baseUrl = getSiteBaseUrl();

	// Candidate pool: registered, active, opted-in, with an email.
	const candidates = await prisma.user.findMany({
		where: {
			userType: 'REGISTERED',
			isActive: true,
			marketingUnsubscribedAt: null,
			email: { not: '' }
		},
		select: { id: true, email: true, fullName: true },
		take: limit * 6
	});
	if (candidates.length === 0) return { sent: 0, skipped: 0 };

	const ids = candidates.map((c) => c.id);
	// Already-sent this touch (dedupe).
	const sentRows = await prisma.emailNotification.findMany({
		where: {
			notificationType: 'numbers_launch',
			referenceId: { in: ids.map((id) => touchReference(touch, id)) }
		},
		select: { referenceId: true }
	});
	const alreadySent = new Set(sentRows.map((r) => r.referenceId));
	const buyers = await numberBuyerIds(ids);

	let sent = 0;
	let skipped = 0;
	for (const user of candidates) {
		if (sent >= limit) break;
		if (!user.email || buyers.has(user.id) || alreadySent.has(touchReference(touch, user.id))) {
			skipped += 1;
			continue;
		}
		const firstName = (user.fullName || '').trim().split(/\s+/)[0] || 'there';
		const result = await sendMarketingEmail({
			to: user.email,
			subject: copy.subject,
			body: `Hi ${firstName},\n\n${copy.body}`,
			ctaText: copy.ctaText,
			ctaUrl: `${baseUrl}/numbers`,
			userId: user.id,
			notificationType: 'numbers_launch',
			referenceId: touchReference(touch, user.id),
			campaignKey: `numbers-launch-t${touch}`
		});
		if (result.success) sent += 1;
		else skipped += 1;
	}
	return { sent, skipped };
}

async function sendDueDiscoveryEmails(limit: number): Promise<{
	sent: number;
	skipped: number;
	touches: Record<number, number>;
}> {
	const baseUrl = getSiteBaseUrl();
	const firstTouchReadyAt = new Date(
		Date.now() - FIRST_TOUCH_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000
	);
	const candidates = await prisma.user.findMany({
		where: {
			userType: 'REGISTERED',
			isActive: true,
			emailVerified: true,
			marketingUnsubscribedAt: null,
			email: { not: '' },
			registeredAt: { lte: firstTouchReadyAt }
		},
		select: { id: true, email: true, fullName: true },
		orderBy: { registeredAt: 'asc' },
		take: Math.max(limit * 6, limit)
	});
	if (candidates.length === 0) return { sent: 0, skipped: 0, touches: {} };

	const ids = candidates.map((candidate) => candidate.id);
	const [sentRows, buyers] = await Promise.all([
		prisma.emailNotification.findMany({
			where: {
				notificationType: 'numbers_launch',
				status: 'sent',
				referenceId: {
					in: ids.flatMap((id) => [1, 2, 3].map((touch) => touchReference(touch, id)))
				}
			},
			select: { referenceId: true, sentAt: true }
		}),
		numberBuyerIds(ids)
	]);
	const sentAtByReference = new Map(
		sentRows.map((row) => [row.referenceId || '', row.sentAt || new Date(0)])
	);

	let sent = 0;
	let skipped = 0;
	const touches: Record<number, number> = {};
	for (const user of candidates) {
		if (sent >= limit) break;
		if (!user.email || buyers.has(user.id)) {
			skipped += 1;
			continue;
		}

		let dueTouch: number | null = null;
		for (let touch = 1; touch <= 3; touch += 1) {
			if (sentAtByReference.has(touchReference(touch, user.id))) continue;
			if (touch === 1) {
				dueTouch = touch;
				break;
			}
			const priorSentAt = sentAtByReference.get(touchReference(touch - 1, user.id));
			const gapMs = TOUCH_GAPS_DAYS[touch - 1] * 24 * 60 * 60 * 1000;
			if (priorSentAt && Date.now() - priorSentAt.getTime() >= gapMs) dueTouch = touch;
			break;
		}
		if (!dueTouch) {
			skipped += 1;
			continue;
		}

		const copy = TOUCH_COPY[dueTouch];
		const firstName = (user.fullName || '').trim().split(/\s+/)[0] || 'there';
		const result = await sendMarketingEmail({
			to: user.email,
			subject: copy.subject,
			body: `Hi ${firstName},\n\n${copy.body}`,
			ctaText: copy.ctaText,
			ctaUrl: `${baseUrl}/numbers`,
			userId: user.id,
			notificationType: 'numbers_launch',
			referenceId: touchReference(dueTouch, user.id),
			campaignKey: `numbers-discovery:t${dueTouch}:${user.id}`
		});
		if (result.success) {
			sent += 1;
			touches[dueTouch] = (touches[dueTouch] || 0) + 1;
		} else {
			skipped += 1;
		}
	}
	return { sent, skipped, touches };
}

/** Daily worker for the evergreen sequence. Safe no-op when the owner switch is off. */
export async function runNumbersCampaignTouches(limit = 400): Promise<{
	ran: boolean;
	touch: number | null;
	sent: number;
	skipped: number;
	touches?: Record<number, number>;
}> {
	const state = await getNumbersCampaignState();
	if (!state.enabled) return { ran: false, touch: null, sent: 0, skipped: 0 };

	const { sent, skipped, touches } = await sendDueDiscoveryEmails(limit);
	return { ran: true, touch: null, sent, skipped, touches };
}

// ---- Launch / stop ---------------------------------------------------------

async function setAnnouncementBannerForNumbers(enabled: boolean): Promise<void> {
	if (enabled) {
		// Ensure the storefront banner feature flag is on so the banner actually renders.
		await prisma.microcopy.upsert({
			where: { key: ANNOUNCEMENT_FLAG_KEY },
			update: { value: 'true', category: 'settings', isActive: true },
			create: {
				key: ANNOUNCEMENT_FLAG_KEY,
				value: 'true',
				category: 'settings',
				description: 'Storefront announcement banner feature flag.',
				isActive: true
			}
		});
	}
	await saveAnnouncementBannerConfig({
		enabled,
		text: NUMBERS_LAUNCH_BANNER_TEXT,
		link: '/numbers',
		dismissible: true
	});
}

export interface LaunchResult {
	launchedAt: string;
	manualTiersRetired: number;
	pushed: number;
	emailSent: number;
}

/** Fire the campaign: state on, banner up, manual tiers retired, push + first email batch. */
export async function launchNumbersCampaign(): Promise<LaunchResult> {
	const launchedAt = new Date().toISOString();
	await setCampaignState({ enabled: true, launchedAt });

	// Cutover: hide the manual phone products.
	const manualTiersRetired = await retireManualPhoneTiers().catch(() => 0);

	// Banner up.
	await setAnnouncementBannerForNumbers(true).catch((e) =>
		console.error('[numbers-campaign] banner enable failed:', e)
	);

	// Launch push to subscribed registered users.
	let pushed = 0;
	try {
		const subs = await prisma.user.findMany({
			where: { userType: 'REGISTERED', isActive: true },
			select: { id: true }
		});
		const ids = subs.map((s) => s.id);
		if (ids.length) {
			await sendPushToUsers(ids, PUSH_PAYLOAD);
			pushed = ids.length;
		}
	} catch (e) {
		console.error('[numbers-campaign] push failed:', e);
	}

	// First email batch (touch 1). The daily cron continues the sequence.
	const { sent } = await sendTouchEmails(1, 300).catch(() => ({ sent: 0, skipped: 0 }));

	return { launchedAt, manualTiersRetired, pushed, emailSent: sent };
}

/** Stop the campaign: disable state + take the banner down. Leaves the cutover in place. */
export async function stopNumbersCampaign(): Promise<void> {
	const state = await getNumbersCampaignState();
	await setCampaignState({ enabled: false, launchedAt: state.launchedAt });
	await setAnnouncementBannerForNumbers(false).catch(() => {});
}

/** True while the launch popup should still surface (within the 10-day campaign window). */
export async function isNumbersLaunchPopupWindowOpen(): Promise<boolean> {
	const state = await getNumbersCampaignState();
	const day = daysSinceLaunch(state);
	return state.enabled && day !== null && day < 10;
}

/** Has this user bought a number? (popup suppression) */
export async function userHasBoughtNumber(userId: string): Promise<boolean> {
	const buyers = await numberBuyerIds([userId]);
	return buyers.has(userId);
}

export async function getNumbersPlatformExists(): Promise<boolean> {
	return (await getNumbersPlatformId()) !== null;
}
