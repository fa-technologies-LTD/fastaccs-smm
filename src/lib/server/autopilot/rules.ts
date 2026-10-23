/**
 * The autopilot's fixed, testable rules: reading admins' replies, deciding prices, scoring
 * channels and writing messages. Pure functions only: no network, no database.
 */

import type { AutopilotSettings } from './settings';

// ---------------------------------------------------------------------------------------------
// Reading admin replies
// ---------------------------------------------------------------------------------------------

export type ReplyIntent =
	| 'price'
	| 'payment_details'
	| 'posted'
	| 'refuse'
	| 'question'
	| 'unclear';

export interface ReadReply {
	intent: ReplyIntent;
	priceNgn: number | null;
	paymentDetails: string | null;
}

const BANKS =
	/\b(opay|palm ?pay|moniepoint|kuda|gt ?bank|gtb|guaranty|access|zenith|uba|united bank|first ?bank|wema|alat|fcmb|sterling|union bank|polaris|keystone|fidelity|ecobank|stanbic|providus|jaiz|globus|taj|vfd|carbon|fairmoney|paga|9 ?psb)\b/i;
const ACCOUNT_NUMBER = /\b\d{10}\b/;
const POSTED =
	/\b(posted|done|it'?s live|its live|live now|uploaded|have posted|check (the )?channel|already up)\b/i;
const REFUSE =
	/\b(not interested|no ads|no promo|we don'?t (do|accept|run)|not available|not taking|can'?t (do|take) (it|this|ads)|cannot (do|take))\b/i;

/**
 * Naira amounts in a message: ₦3,000 · N3000 · #3000 · 3000 naira · 3k · 3.5k · 5,000. Dollar
 * amounts ($5) are converted. Very small or huge numbers (dates, phone numbers) are ignored.
 */
export function findPricesNgn(text: string, usdRate = 1_500): number[] {
	const found: number[] = [];
	const cleaned = text.replace(/\b\d{10,}\b/g, ' '); // account and phone numbers are not prices
	const pattern =
		/(\$|₦|#|\bngn\s?|\bn(?=\d))?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b|thousand\b|naira\b|ngn\b|usd\b|dollars?\b)?/gi;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(cleaned))) {
		const prefix = (match[1] || '').toLowerCase().trim();
		const suffix = (match[3] || '').toLowerCase();
		let amount = Number(match[2].replace(/,/g, ''));
		if (!Number.isFinite(amount)) continue;
		const isUsd = prefix === '$' || suffix === 'usd' || suffix.startsWith('dollar');
		const marked = Boolean(prefix) || Boolean(suffix);
		if (suffix === 'k' || suffix === 'thousand') amount *= 1_000;
		if (isUsd) amount *= usdRate;
		// Bare small numbers ("2 posts", "24 hours") are not prices.
		if (!marked && amount < 500) continue;
		if (amount < 300 || amount > 1_000_000) continue;
		found.push(Math.round(amount));
	}
	return [...new Set(found)];
}

export function extractPaymentDetails(text: string): string | null {
	if (!ACCOUNT_NUMBER.test(text) || !BANKS.test(text)) return null;
	return text.trim().slice(0, 300);
}

/** What the admin is telling us. Anything not clearly one thing is `unclear` (LLM or owner). */
export function readReply(text: string, usdRate = 1_500): ReadReply {
	const trimmed = text.trim();
	const paymentDetails = extractPaymentDetails(trimmed);
	if (paymentDetails) return { intent: 'payment_details', priceNgn: null, paymentDetails };
	if (REFUSE.test(trimmed)) return { intent: 'refuse', priceNgn: null, paymentDetails: null };
	const prices = findPricesNgn(trimmed, usdRate);
	if (prices.length === 1) return { intent: 'price', priceNgn: prices[0], paymentDetails: null };
	if (prices.length > 1) return { intent: 'unclear', priceNgn: null, paymentDetails: null };
	if (POSTED.test(trimmed)) return { intent: 'posted', priceNgn: null, paymentDetails: null };
	if (trimmed.includes('?')) return { intent: 'question', priceNgn: null, paymentDetails: null };
	return { intent: 'unclear', priceNgn: null, paymentDetails: null };
}

// ---------------------------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------------------------

/** Most we'll pay for one post in this channel: the per-post cap, or the per-1,000-views cap. */
export function maxPriceFor(
	avgViews: number,
	settings: Pick<AutopilotSettings, 'maxPerPostNgn' | 'maxPer1kViewsNgn'>
): number {
	const byViews = Math.floor((Math.max(0, avgViews) / 1_000) * settings.maxPer1kViewsNgn);
	const capped = Math.min(settings.maxPerPostNgn, byViews);
	return Math.floor(capped / 500) * 500; // round down to a tidy ₦500
}

export type PriceDecision =
	| { action: 'accept'; priceNgn: number }
	| { action: 'counter'; priceNgn: number }
	| { action: 'decline'; reason: 'too_high' | 'no_budget' };

/** Accept within the limit; counter once if within 1.5×; otherwise decline politely. */
export function decidePrice(input: {
	quotedNgn: number;
	maxNgn: number;
	remainingBudgetNgn: number;
	alreadyCountered: boolean;
}): PriceDecision {
	const affordable = Math.min(input.maxNgn, input.remainingBudgetNgn);
	if (affordable < 500) return { action: 'decline', reason: 'no_budget' };
	if (input.quotedNgn <= affordable) return { action: 'accept', priceNgn: input.quotedNgn };
	if (!input.alreadyCountered && input.quotedNgn <= affordable * 1.5) {
		return { action: 'counter', priceNgn: affordable };
	}
	return {
		action: 'decline',
		reason: input.remainingBudgetNgn < input.maxNgn ? 'no_budget' : 'too_high'
	};
}

// ---------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------

export function median(values: number[]): number {
	const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Typical views per post: the median of recent posts (one viral post can't inflate it). */
export function typicalViews(posts: Array<{ views: number | null | undefined }>): number {
	return median(posts.slice(0, 12).map((post) => Number(post.views ?? 0)));
}

/** @handles and t.me links in a channel's description that might be the person to contact. */
export function promoContactCandidates(about: string, channelUsername: string): string[] {
	const handles = new Set<string>();
	const text = about || '';
	for (const match of text.matchAll(/(?:t\.me\/|@)([a-zA-Z][a-zA-Z0-9_]{3,31})/g)) {
		const handle = match[1].toLowerCase();
		if (handle !== channelUsername.toLowerCase() && !handle.startsWith('joinchat'))
			handles.add(handle);
	}
	// Handles next to "ads", "promo" or "advert" come first.
	const promoLine = text
		.split(/\n/)
		.filter((line) => /\b(ads?|advert|promo|promotion|sponsor|business|contact|enquir)/i.test(line))
		.join(' ');
	return [...handles].sort(
		(a, b) =>
			Number(promoLine.toLowerCase().includes(b)) - Number(promoLine.toLowerCase().includes(a))
	);
}

export interface ChannelSnapshot {
	members: number;
	avgViews: number;
	lastPostAt: Date | null;
	text: string; // title + description, for relevance
}

/** Worth contacting? Real views, recent posts, and a person to message. */
export function channelQualifies(
	snapshot: ChannelSnapshot,
	settings: Pick<AutopilotSettings, 'minAvgViews'>,
	now: Date = new Date()
): { ok: boolean; reason?: string } {
	if (snapshot.avgViews < settings.minAvgViews) return { ok: false, reason: 'few views' };
	if (!snapshot.lastPostAt || now.getTime() - snapshot.lastPostAt.getTime() > 7 * 86_400_000) {
		return { ok: false, reason: 'inactive' };
	}
	// Views far above members usually means bought views or a forwarded viral post.
	if (snapshot.members > 0 && snapshot.avgViews > snapshot.members * 1.5)
		return { ok: false, reason: 'suspicious views' };
	return { ok: true };
}

const NIGERIA_SIGNALS = [
	/\bnigeria(?:n|ns)?\b/i,
	/\bnaija\b/i,
	/\b9ja\b/i,
	/\b(?:lagos|abuja|ibadan|port harcourt|enugu|kano)\b/i,
	/₦/,
	/\b(?:naira|ngn)\b/i,
	/\b(?:opay|palmpay|moniepoint|kuda)\b/i
];

/** How Nigerian a channel looks (0 = no sign at all). Nigerian channels are our buyers. */
export function nigeriaScore(text: string): number {
	return NIGERIA_SIGNALS.filter((signal) => signal.test(text || '')).length;
}

/**
 * Channels a channel points to in its posts (@handles and t.me links). Channels that cross-promote
 * are exactly the ones that sell posts, so these are good places to look next.
 */
export function mentionedUsernames(texts: string[], self: string): string[] {
	const found = new Set<string>();
	for (const text of texts) {
		for (const match of (text || '').matchAll(/(?:t\.me\/|@)([a-zA-Z][a-zA-Z0-9_]{3,31})/g)) {
			const name = match[1].toLowerCase();
			if (name === self.toLowerCase() || name.startsWith('joinchat') || name.endsWith('bot'))
				continue;
			found.add(name);
		}
	}
	return [...found];
}

// ---------------------------------------------------------------------------------------------
// Messages we send (fixed, reviewed wording)
// ---------------------------------------------------------------------------------------------

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export const autopilotCopy = {
	intro: (title: string) =>
		`Hi! I'm with FastAccs (smm.fastaccs.com), a Nigerian store for ready social media accounts. We'd like to book one sponsored post in ${title}. What's your price for a single post?`,
	counter: (title: string, price: number) =>
		`Thanks! Our budget for one post in ${title} is ${naira(price)}. Can you do that?`,
	/** Not a commitment: the owner approves every payment. */
	withinBudget: (price: number) =>
		`Thanks, ${naira(price)} is within our budget. Please send the account details for payment (bank, account number and name) and I'll get it approved.`,
	decline: () =>
		`Thanks for the quick reply! That's above our budget for now. We'll reach out again when we have more room.`,
	paymentAck: () => `Thank you! Payment will be on its way shortly.`,
	paidWithPost: (post: string) =>
		`Payment sent ✅ Here's the post. Please let me know once it's live:\n\n${post}`,
	postReminder: () => `Hi! Just checking on our post. Please let me know once it's live 🙏`,
	cancel: () => `Sorry, we have to cancel this one for now. Thanks for your time.`
};

export interface DealBriefInput {
	username: string;
	title: string;
	members: number;
	avgViews: number;
	priceNgn: number;
	paymentDetails: string;
	post: string;
	targetCacNgn: number;
}

/**
 * The owner's one-tap approval card: what we'd buy, what to expect, and who gets paid. Visits are
 * a rough 1–3% of views; break-even is how many new buyers the post must bring at our target.
 */
export function dealBrief(input: DealBriefInput): string {
	const perK = input.avgViews > 0 ? input.priceNgn / (input.avgViews / 1_000) : 0;
	const low = Math.max(1, Math.round(input.avgViews * 0.01));
	const high = Math.max(low, Math.round(input.avgViews * 0.03));
	const breakEven = Math.max(1, Math.ceil(input.priceNgn / input.targetCacNgn));
	return [
		`💸 Approve ${naira(input.priceNgn)} for one post in ${input.title}`,
		`https://t.me/${input.username}`,
		'',
		`Channel: ${input.members.toLocaleString('en-NG')} members · about ${input.avgViews.toLocaleString('en-NG')} views per post`,
		`Cost: ${naira(perK)} per 1,000 views`,
		`Expect: roughly ${low.toLocaleString('en-NG')}–${high.toLocaleString('en-NG')} visits to the site`,
		`Worth it if: it brings ${breakEven}+ new buyer${breakEven === 1 ? '' : 's'} (our target is ${naira(input.targetCacNgn)} per buyer)`,
		'',
		'The post they will publish:',
		input.post,
		'',
		'Pay to:',
		input.paymentDetails,
		'',
		"Send the transfer, then tap Approve. The post goes to them automatically and I'll tell you when it's live."
	].join('\n');
}

export function postCopy(input: {
	link: string;
	code: string;
	percent: number;
	days: number;
}): string {
	const offer =
		input.percent > 0
			? `\n🎁 Code ${input.code} = ${input.percent}% off (ends in ${input.days} days)`
			: '';
	return `🚀 Need X (Twitter) accounts?\nFastAccs has ready X accounts, delivered straight to your dashboard: fresh accounts, aged accounts and accounts with real followers.\nBuy one or many in one checkout.${offer}\n👉 ${input.link}`;
}

/** A per-channel code like TGAIRDRO10: lets us count buyers even without cookies. */
export function placementCode(
	channelUsername: string,
	percent: number,
	taken: Set<string> = new Set()
): string {
	const base = `TG${channelUsername
		.replace(/[^a-z0-9]/gi, '')
		.toUpperCase()
		.slice(0, 6)}${percent}`;
	let code = base;
	for (let n = 2; taken.has(code); n += 1) code = `${base}${n}`;
	return code;
}

/** Did this channel post our ad? We look for our link or the channel's code. */
export function isOurPost(text: string, code: string | null): boolean {
	const lower = (text || '').toLowerCase();
	return (
		lower.includes('fastaccs.com') || (Boolean(code) && lower.includes(String(code).toLowerCase()))
	);
}
