import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from '$lib/services/email';
import { sendPushToUsers } from '$lib/services/push-notifications';
import { saveAnnouncementBannerConfig } from '$lib/services/announcement-banner';
import { getNumbersPlatformId } from '$lib/services/phone-catalog';
import { getSiteBaseUrl } from '$lib/helpers/site-url';

/**
 * "Numbers are live" launch campaign — a tapered 3-touch announcement gated behind an
 * admin switch. NOTHING fires until an admin clicks Launch (post-prod). Touches:
 *   T0    banner + in-app popup + email + push
 *   T+3d  email + popup (reminder)
 *   T+7d  email + banner (last call)
 * A buyer who has already bought a number is suppressed from all remaining touches.
 */

const CAMPAIGN_KEY = 'config.numbers_launch_campaign';
const ANNOUNCEMENT_FLAG_KEY = 'feature.admin_announcement_banner.enabled';
const MANUAL_PHONE_PLATFORM = 'Foreign Phone Numbers';

// Touch windows (days since launch): [start, endExclusive)
const TOUCH_WINDOWS: Record<number, [number, number]> = {
	1: [0, 3],
	2: [3, 7],
	3: [7, 10]
};

export interface NumbersCampaignState {
	enabled: boolean;
	launchedAt: string | null;
}

// ---- Copy (Speed hook) -----------------------------------------------------

export const NUMBERS_LAUNCH_BANNER_TEXT =
	'⚡ New: instant verification numbers — get your one-time code in seconds.';

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
		subject: 'New: get a verification code in seconds ⚡',
		body: `Verifying an account used to mean waiting on us. Not anymore.

Numbers are now fully automated. Pick a service, grab a number, and your one-time code appears on your order page in seconds — no chat, no waiting.

WhatsApp, Telegram, Google, Instagram, Facebook and more.
No code within the window? You're instantly refunded to store credit.`,
		ctaText: 'Get a number'
	},
	2: {
		subject: 'Verify WhatsApp, Telegram & Google — instantly',
		body: `Need to verify a new account? Do it in seconds, any time.

Buy an instant number for the platform you need, receive the code automatically, done. It's self-serve and available 24/7 — and if no code arrives, you're refunded on the spot.

A quick reminder that it's live and ready whenever you are.`,
		ctaText: 'See available numbers'
	},
	3: {
		subject: 'Your account, verified in seconds',
		body: `Last nudge — our instant Numbers are live and they're the fastest way to verify.

One number, one code, seconds — for WhatsApp, Telegram, Google and more. Risk-free: no code, instant refund.

Give it a try next time you set up an account.`,
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
			description: 'Numbers launch campaign state (enabled, launchedAt).',
			isActive: true
		}
	});
}

/** Days elapsed since launch, or null if not launched. */
export function daysSinceLaunch(state: NumbersCampaignState, now = Date.now()): number | null {
	if (!state.launchedAt) return null;
	return Math.floor((now - new Date(state.launchedAt).getTime()) / 86_400_000);
}

/** The touch (1/2/3) whose window currently covers `day`, or null. */
function currentTouch(day: number): number | null {
	for (const [touch, [start, end]] of Object.entries(TOUCH_WINDOWS)) {
		if (day >= start && day < end) return Number(touch);
	}
	return null;
}

// ---- Cutover (retire manual phone tiers) -----------------------------------

async function setManualPhoneTiersActive(active: boolean): Promise<number> {
	const platform = await prisma.category.findFirst({
		where: { name: { contains: MANUAL_PHONE_PLATFORM, mode: 'insensitive' }, categoryType: 'platform' },
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
async function sendTouchEmails(touch: number, limit: number): Promise<{ sent: number; skipped: number }> {
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

/** Cron worker: send whichever touch is currently due. Safe no-op when disabled. */
export async function runNumbersCampaignTouches(limit = 400): Promise<{
	ran: boolean;
	touch: number | null;
	sent: number;
	skipped: number;
}> {
	const state = await getNumbersCampaignState();
	const day = daysSinceLaunch(state);
	if (!state.enabled || day === null) return { ran: false, touch: null, sent: 0, skipped: 0 };

	const touch = currentTouch(day);
	if (touch === null) return { ran: true, touch: null, sent: 0, skipped: 0 };

	const { sent, skipped } = await sendTouchEmails(touch, limit);
	return { ran: true, touch, sent, skipped };
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
