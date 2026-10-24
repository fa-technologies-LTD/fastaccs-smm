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
	| 'accept' // yes to our proposal (the partner deal)
	| 'question'
	| 'unclear';

export interface ReadReply {
	intent: ReplyIntent;
	priceNgn: number | null;
	paymentDetails: string | null;
	/** Several prices (a rate card): every one of them, cheapest first. */
	priceOptions?: number[];
}

const BANKS =
	/\b(opay|palm ?pay|moniepoint|kuda|gt ?bank|gtb|guaranty|access|zenith|uba|united bank|first ?bank|wema|alat|fcmb|sterling|union bank|polaris|keystone|fidelity|ecobank|stanbic|providus|jaiz|globus|taj|vfd|carbon|fairmoney|paga|9 ?psb)\b/i;
const ACCOUNT_NUMBER = /\b\d{10}\b/;
const ACCEPT =
	/^\W*(yes|yeah|yep|yh|ok|okay|ok+ay*|sure|deal|fine|alright|cool|interested|i'?m in|let'?s go|go ahead|no problem|no wahala)\b|\b(i'?m interested|sounds good|that works|let'?s do (it|that)|i agree|count me in)\b/i;
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
		// A marked amount ($1,000, N100k) is a price however big; a bare huge number is not.
		if (amount < 300 || amount > (marked ? 50_000_000 : 1_000_000)) continue;
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
	if (prices.length > 1) {
		return {
			intent: 'unclear',
			priceNgn: null,
			paymentDetails: null,
			priceOptions: [...prices].sort((a, b) => a - b)
		};
	}
	if (ACCEPT.test(trimmed)) return { intent: 'accept', priceNgn: null, paymentDetails: null };
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
	/\b(?:lagos|abuja|ibadan|port harcourt|enugu|kano|kaduna|owerri|warri|benin city)\b/i,
	/\b(?:arewa|hausa|yoruba|igbo)\b/i,
	// A few common Hausa / Pidgin words: posts in these languages rarely say "Nigeria".
	/\b(?:wallahi|kudi|abeg|wetin|dey|sabi)\b/i,
	/₦/,
	/\b(?:naira|ngn)\b/i,
	/\b(?:opay|palmpay|moniepoint|kuda)\b/i
];

/** How Nigerian a channel looks (0 = no sign at all). Nigerian channels are our buyers. */
export function nigeriaScore(text: string): number {
	return NIGERIA_SIGNALS.filter((signal) => signal.test(text || '')).length;
}

/** Channel usernames from pasted links or @handles (t.me/x, https://t.me/s/x, @x, x), deduplicated. */
export function parseChannelList(text: string): string[] {
	const found = new Set<string>();
	for (const raw of (text || '').split(/[\s,]+/)) {
		const match = raw
			.trim()
			.match(
				/^(?:https?:\/\/)?(?:t\.me\/(?:s\/)?|telegram\.me\/)?@?([a-zA-Z][a-zA-Z0-9_]{3,31})(?:\/\d+)?\/?(?:\?.*)?$/
			);
		if (match && !/^(joinchat|addlist)$/i.test(match[1])) found.add(match[1].toLowerCase());
	}
	return [...found];
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
// Checks: is the audience real, Nigerian and in our niche? Is the person we pay really the admin?
// Blockers stop a channel (or a payment card); warnings go on the owner's card for them to judge.
// ---------------------------------------------------------------------------------------------

const NICHE =
	/\b(airdrops?|crypto|bitcoin|btc|usdt|web3|tokens?|mining|earn(?:ing)?|hustle|make money|online jobs?|twitter|x accounts?|followers|tech|forex|giveaways?|football|soccer|sports?|epl|premier league|la ?liga|ucl|champions league|super eagles|transfers?|matches|fixtures|betting|odds|news|breaking|headlines|politics)\b/i;
const SPONSORED = /(#ad\b|\bsponsored\b|\bpromo(?:tion)?\b|\badvert|\bpaid post\b)/i;

interface PostLike {
	views: number;
	date: Date;
	text: string;
	reactions?: number;
	forwards?: number;
	replies?: number;
}

export interface AudienceFacts {
	avgViews: number;
	/** Median views as a share of members (%). */
	viewShare: number | null;
	/** Reactions + shares + comments per 1,000 views. */
	engagementPer1k: number;
	postsLastWeek: number;
	nigerianPosts: number;
	nichePosts: number;
	sponsoredPosts: number;
	postsChecked: number;
}

export interface AudienceCheck {
	blockers: string[];
	warnings: string[];
	facts: AudienceFacts;
}

export function checkAudience(
	input: { members: number; posts: PostLike[]; title: string; about: string },
	settings: Pick<AutopilotSettings, 'minAvgViews'>,
	now: Date = new Date()
): AudienceCheck {
	const posts = input.posts.slice(0, 12);
	const avgViews = typicalViews(posts);
	const lastPostAt = posts[0]?.date ?? null;
	const blockers: string[] = [];
	const warnings: string[] = [];

	const fit = channelQualifies(
		{ members: input.members, avgViews, lastPostAt, text: input.about },
		settings,
		now
	);
	if (!fit.ok) blockers.push(fit.reason ?? 'not a fit');
	const nigeria = nigeriaScore([input.title, input.about, ...posts.map((p) => p.text)].join('\n'));
	if (nigeria === 0) blockers.push('not Nigerian');

	// Engagement on posts old enough to have been seen.
	const settled = posts.filter((p) => now.getTime() - p.date.getTime() > 6 * 3_600_000);
	const views = settled.reduce((sum, p) => sum + p.views, 0);
	const actions = settled.reduce(
		(sum, p) => sum + (p.reactions ?? 0) + (p.forwards ?? 0) + (p.replies ?? 0),
		0
	);
	const engagementPer1k = views > 0 ? Math.round((actions / views) * 10_000) / 10 : 0;
	const viewShare = input.members > 0 ? Math.round((avgViews / input.members) * 1000) / 10 : null;
	const postsLastWeek = posts.filter(
		(p) => now.getTime() - p.date.getTime() < 7 * 86_400_000
	).length;
	const nigerianPosts = posts.filter((p) => nigeriaScore(p.text) > 0).length;
	const nichePosts = posts.filter((p) => NICHE.test(p.text)).length;
	const sponsoredPosts = posts.filter((p) => SPONSORED.test(p.text)).length;

	if (views >= 1_000 && engagementPer1k < 1) {
		warnings.push(
			`Almost no reactions or shares for its views (${engagementPer1k} per 1,000): views may be bought`
		);
	}
	const settledViews = settled.filter((p) => now.getTime() - p.date.getTime() > 24 * 3_600_000);
	if (settledViews.length >= 5) {
		const mean = settledViews.reduce((sum, p) => sum + p.views, 0) / settledViews.length;
		const spread = Math.sqrt(
			settledViews.reduce((sum, p) => sum + (p.views - mean) ** 2, 0) / settledViews.length
		);
		if (mean > 0 && spread / mean < 0.03)
			warnings.push('Views are suspiciously even from post to post');
	}
	if (viewShare !== null && viewShare < 3 && input.members >= 1_000) {
		warnings.push(`Only ${viewShare}% of members see a post: many members may be bought`);
	}
	if (postsLastWeek < 3 && fit.ok)
		warnings.push(`Posts rarely (${postsLastWeek} in the last week)`);
	if (nigeria > 0 && nigerianPosts < 2 && posts.length >= 6) {
		warnings.push(`Only ${nigerianPosts} of ${posts.length} recent posts look Nigerian`);
	}
	if (nichePosts === 0 && !NICHE.test(`${input.title} ${input.about}`)) {
		warnings.push('Posts are not about crypto, hustle, X, tech, sports or news');
	}
	return {
		blockers,
		warnings,
		facts: {
			avgViews,
			viewShare,
			engagementPer1k,
			postsLastWeek,
			nigerianPosts,
			nichePosts,
			sponsoredPosts,
			postsChecked: posts.length
		}
	};
}

/**
 * Extra bar for channels the autopilot finds by itself (outreach slots are few): most members must
 * not be fake, and the posts themselves must look Nigerian, not just the channel's name.
 */
export function searchBlocker(facts: AudienceFacts, members: number): string | null {
	if (facts.viewShare !== null && facts.viewShare < 1 && members >= 10_000)
		return 'members look bought';
	if (facts.postsChecked >= 6 && facts.nigerianPosts < 2) return 'posts not Nigerian';
	return null;
}

/** The admin we deal with: a real person, not labelled by Telegram, named by the channel itself. */
export function checkContact(input: {
	contact: string;
	person: { scam: boolean; fake: boolean } | null;
	about: string;
}): { blockers: string[]; warnings: string[] } {
	const blockers: string[] = [];
	const warnings: string[] = [];
	if (!input.person) blockers.push(`@${input.contact} is not a person we can message`);
	else if (input.person.scam) blockers.push(`Telegram labels @${input.contact} as SCAM`);
	else if (input.person.fake)
		blockers.push(`Telegram labels @${input.contact} as FAKE (impersonation)`);
	const listed = new RegExp(`(?:@|t\\.me/)${input.contact}\\b`, 'i').test(input.about || '');
	if (!listed) {
		warnings.push(
			`@${input.contact} is not named in the channel's description, so we can't confirm they run it`
		);
	}
	return { blockers, warnings };
}

const NAME_NOISE = new Set([
	'bank',
	'account',
	'acct',
	'name',
	'number',
	'details',
	'plc',
	'limited',
	'ltd',
	'microfinance',
	'mfb',
	'opay',
	'palmpay',
	'moniepoint',
	'kuda',
	'gtb',
	'gtbank',
	'guaranty',
	'trust',
	'access',
	'zenith',
	'uba',
	'united',
	'first',
	'firstbank',
	'wema',
	'alat',
	'fcmb',
	'sterling',
	'union',
	'polaris',
	'keystone',
	'fidelity',
	'ecobank',
	'stanbic',
	'ibtc',
	'providus',
	'jaiz',
	'globus',
	'taj',
	'vfd',
	'carbon',
	'fairmoney',
	'paga',
	'psb',
	'the',
	'and',
	'pay',
	'send',
	'to'
]);

function nameWords(text: string): string[] {
	return (text || '')
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter((word) => word.length >= 3 && !NAME_NOISE.has(word));
}

/** Who gets paid: warnings only (people often get paid into a relative's account). */
export function checkPayment(input: {
	details: string;
	adminName: string;
	channelTitle: string;
	sameAccountElsewhere: string[];
}): string[] {
	const warnings: string[] = [];
	const account = input.details.match(/\b\d{10}\b/)?.[0];
	if (!account) warnings.push('No 10-digit account number in their details');
	const known = new Set([...nameWords(input.adminName), ...nameWords(input.channelTitle)]);
	const payee = nameWords(input.details);
	if (payee.length && !payee.some((word) => known.has(word))) {
		warnings.push(
			`The account name doesn't match the admin's Telegram name${input.adminName ? ` (${input.adminName})` : ''}`
		);
	}
	if (input.sameAccountElsewhere.length) {
		warnings.push(
			`The same account number was given for ${input.sameAccountElsewhere.map((u) => `@${u}`).join(', ')}: one person may be posing as several channels`
		);
	}
	return warnings;
}

/** Lines for the owner's card: ✅ for what checked out, ⚠ for each warning. */
export function checkLines(facts: AudienceFacts | null, warnings: string[]): string[] {
	const lines: string[] = [];
	if (facts) {
		lines.push(
			`✅ ${facts.avgViews.toLocaleString('en-NG')} views per post${facts.viewShare !== null ? ` (${facts.viewShare}% of members)` : ''}, ${facts.postsLastWeek} posts this week`
		);
		lines.push(
			`${facts.engagementPer1k >= 1 ? '✅' : '⚠'} ${facts.engagementPer1k} reactions/shares per 1,000 views`
		);
		lines.push(
			`✅ ${facts.nigerianPosts} of ${facts.postsChecked} recent posts look Nigerian · ${facts.nichePosts} in our niches (crypto, hustle, X, tech, sports, news)${facts.sponsoredPosts ? ` · runs sponsored posts (${facts.sponsoredPosts} seen)` : ''}`
		);
	}
	for (const warning of warnings) lines.push(`⚠ ${warning}`);
	return lines;
}

// ---------------------------------------------------------------------------------------------
// Messages we send (fixed, reviewed wording)
// ---------------------------------------------------------------------------------------------

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export const autopilotCopy = {
	intro: (title: string) =>
		`Hi! I'm reaching out on behalf of FastAccs (https://smm.fastaccs.com), a platform for ready-to-use social media accounts.\nWe're interested in placing a sponsored post on ${title}. Could you share your rate for a single promotional post?`,
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
	cancel: () => `Sorry, we have to cancel this one for now. Thanks for your time.`,
	/** Instead of declining: no upfront fee, a share of sales made with their channel's code. */
	partnerOffer: (percent: number, days: number) =>
		`Thanks for the quick reply! That's above our budget for a paid post right now. We do have another option: post our ad for free and earn ${percent}% of every sale your readers make with your channel's own discount code, for ${days} days. We track it automatically and pay you every week by bank transfer. Would that work for you?`,
	partnerAskDetails: () =>
		`Great! Please send the bank details for your weekly payouts (bank, account number and name) and I'll get it approved.`,
	partnerStillTooHigh: () =>
		`Thanks! That's still above our budget for a paid post. The pay-per-sale option stays open if you'd like it.`,
	partnerWelcome: (input: { post: string; code: string; percent: number; until: string }) =>
		`You're in ✅ Your channel's code is ${input.code}: your readers get a discount, and you earn ${input.percent}% of every order that uses it until ${input.until}. Payouts go out every Monday. Here's the post; please let me know once it's live:\n\n${input.post}`,
	partnerPaid: (amount: number, orders: number) =>
		`Sent you ${naira(amount)} for ${orders} sale${orders === 1 ? '' : 's'} made with your code 🙌 Thanks for partnering with FastAccs!`
};

/** Their share of sales, rounded down to the naira. */
export function partnerCommission(salesNgn: number, percent: number): number {
	return Math.max(0, Math.floor((salesNgn * percent) / 100));
}

const shortDate = (iso: string) =>
	new Date(iso).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'Africa/Lagos'
	});

/** The owner's one-tap card for a new pay-per-sale partner. Nothing is paid at this point. */
export function partnerBrief(input: {
	username: string;
	title: string;
	members: number;
	avgViews: number;
	quotedNgn: number | null;
	maxPriceNgn: number;
	percent: number;
	days: number;
	paymentDetails: string;
	checks?: string[];
	blockers?: string[];
}): string {
	const low = Math.max(1, Math.round(input.avgViews * 0.01));
	const high = Math.max(low, Math.round(input.avgViews * 0.03));
	return [
		...(input.blockers?.length ? [`⛔ DO NOT APPROVE: ${input.blockers.join('; ')}`, ''] : []),
		`🤝 Approve a pay-per-sale partner: ${input.title}`,
		`https://t.me/${input.username}`,
		'',
		`They asked ${input.quotedNgn ? naira(input.quotedNgn) : 'more'}, above our limit of ${naira(input.maxPriceNgn)}. Instead they post for free and earn ${input.percent}% of sales made with their channel's code for ${input.days} days.`,
		`Channel: ${input.members.toLocaleString('en-NG')} members · about ${input.avgViews.toLocaleString('en-NG')} views per post`,
		`Expect: roughly ${low.toLocaleString('en-NG')}–${high.toLocaleString('en-NG')} visits to the site`,
		...(input.checks?.length ? ['', 'Checks:', ...input.checks] : []),
		'',
		'Weekly payouts to:',
		input.paymentDetails,
		'',
		'Nothing is paid now. Each Monday you get a payout card for their sales, and you approve each one.'
	].join('\n');
}

/** The owner's weekly payout card for one partner. */
export function partnerPayoutBrief(input: {
	username: string;
	title: string;
	code: string;
	from: string;
	to: string;
	orders: number;
	salesNgn: number;
	percent: number;
	amountNgn: number;
	paymentDetails: string;
}): string {
	return [
		`💰 Partner payout: ${input.title} (@${input.username})`,
		`${input.orders} order${input.orders === 1 ? '' : 's'} with code ${input.code} from ${shortDate(input.from)} to ${shortDate(input.to)}: ${naira(input.salesNgn)} in sales (after refunds)`,
		`Their ${input.percent}%: ${naira(input.amountNgn)}`,
		'',
		'Pay to:',
		input.paymentDetails,
		'',
		"Send the transfer, then tap the button. 'Not now' carries it over to next week."
	].join('\n');
}

export interface DealBriefInput {
	username: string;
	title: string;
	members: number;
	avgViews: number;
	priceNgn: number;
	paymentDetails: string;
	post: string;
	targetCacNgn: number;
	/** ✅/⚠ lines from the audience, admin and payment checks. */
	checks?: string[];
	/** Reasons not to pay at all (e.g. Telegram labels the admin a scam). */
	blockers?: string[];
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
	const blocked = input.blockers?.length ? input.blockers : null;
	return [
		...(blocked ? [`⛔ DO NOT PAY: ${blocked.join('; ')}`, ''] : []),
		`💸 Approve ${naira(input.priceNgn)} for one post in ${input.title}`,
		`https://t.me/${input.username}`,
		'',
		`Channel: ${input.members.toLocaleString('en-NG')} members · about ${input.avgViews.toLocaleString('en-NG')} views per post`,
		`Cost: ${naira(perK)} per 1,000 views`,
		`Expect: roughly ${low.toLocaleString('en-NG')}–${high.toLocaleString('en-NG')} visits to the site`,
		`Worth it if: it brings ${breakEven}+ new buyer${breakEven === 1 ? '' : 's'} (our target is ${naira(input.targetCacNgn)} per buyer)`,
		...(input.checks?.length ? ['', 'Checks:', ...input.checks] : []),
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
