import { nigeriaScore } from './rules';

/**
 * Group chats: spotting people asking to buy accounts, reading a group's rules, deciding which
 * groups are worth joining, and the fixed wording we post. Pure functions, no Telegram calls.
 */

/** Platforms FastAccs sells, as people write them, and their page on the site. */
const PLATFORMS: Array<{ name: string; slug: string; pattern: RegExp }> = [
	{ name: 'X (Twitter)', slug: 'x', pattern: /\b(twitter|tweeter|x)\b/i },
	{ name: 'Instagram', slug: 'Instagram', pattern: /\b(instagram|insta|ig)\b/i },
	{ name: 'TikTok', slug: 'tiktok', pattern: /\b(tiktok|tik tok)\b/i },
	{ name: 'Facebook', slug: 'facebook', pattern: /\b(facebook|fb)\b/i },
	{ name: 'LinkedIn', slug: 'linkedin', pattern: /\b(linkedin|linked in)\b/i },
	{ name: 'Gmail and email', slug: 'mails', pattern: /\b(gmail|g-mail|e-?mail|mail)\b/i }
];
const ACCOUNT = /\b(accounts?|accts?|accs?|handles?|pages?|profiles?)\b/i;
const BUYING =
	/\b(who|where|anyone|any one|anybody|need|needed|looking for|i want|want to buy|wan buy|buy|buying|purchase|plug|vendor|recommend|dey sell|sells?)\b/i;
/** Sellers advertising, not buyers asking. */
const SELLING =
	/(for sale|available now|in stock|dm (me )?(to|for) (buy|order|price)|\bi sell\b|\bwe sell\b|\b(i'?m|we'?re|i am|we are) selling\b|price ?list|contact me for|order now|₦\s?\d|#\d{3,}|\bn\d{3,})/i;

/** A message asking where to buy an account we sell: the platform (and its page), or null. */
export function buyRequest(text: string): { name: string; slug: string } | null {
	const message = (text || '').trim();
	if (!message || message.length > 400) return null;
	if (SELLING.test(message) || !ACCOUNT.test(message) || !BUYING.test(message)) return null;
	// "X" alone is too common a letter: only count it next to "account".
	const xAccount = /\bx\s*(accounts?|accts?|handles?)\b|\b(accounts?|handles?) on x\b/i.test(
		message
	);
	for (const platform of PLATFORMS) {
		if (platform.name.startsWith('X') && !/\b(twitter|tweeter)\b/i.test(message) && !xAccount)
			continue;
		if (platform.pattern.test(message)) return { name: platform.name, slug: platform.slug };
	}
	return null;
}

const NO_LINKS =
	/(no (links?|ads?|adverts?|advertis\w*|promo\w*|spam\w*|marketing|selling|business|self[- ]promo\w*)|links? (are )?(not allowed|prohibited|banned|forbidden)|don'?t (post|share|send|drop) (any )?links|(ads?|adverts?|promo\w*) (are )?(not allowed|prohibited|banned|forbidden))/i;
const ADS_OK =
	/((ads?|adverts?|promo\w*|advertis\w*) (are |is )?(allowed|welcome|permitted)|post your (links?|business|ads?|products?)|share your (links?|business)|promote your|buy ?(and|&|n) ?sell|marketplace|free (ads?|promo\w*)|business (group|hub|forum|network))/i;

export interface GroupRules {
	/** The rules say links or ads are not allowed: we never post there. */
	linksBanned: boolean;
	/** The rules invite promotion: we may post an occasional promo. */
	adsAllowed: boolean;
}

export function readGroupRules(about: string, pinned: string): GroupRules {
	const text = `${about}\n${pinned}`;
	const linksBanned = NO_LINKS.test(text);
	return { linksBanned, adsAllowed: !linksBanned && ADS_OK.test(text) };
}

export interface GroupSnapshot {
	title: string;
	about: string;
	members: number;
	pinned: string;
	messages: Array<{ date: Date; text: string }>;
}

/** Worth joining? Active, Nigerian, a real crowd, and we're allowed to post links. */
export function groupQualifies(
	group: GroupSnapshot,
	now: Date = new Date(),
	options: { ownerPick?: boolean } = {}
): { ok: boolean; reason?: string; rules: GroupRules } {
	const rules = readGroupRules(group.about, group.pinned);
	if (rules.linksBanned) return { ok: false, reason: 'no links allowed', rules };
	if (options.ownerPick) return { ok: true, rules };
	if (group.members < 300) return { ok: false, reason: 'small group', rules };
	const lastDay = group.messages.filter((m) => now.getTime() - m.date.getTime() < 86_400_000);
	if (lastDay.length < 10) return { ok: false, reason: 'quiet group', rules };
	const text = [group.title, group.about, ...group.messages.map((m) => m.text)].join('\n');
	if (nigeriaScore(text) === 0) return { ok: false, reason: 'not Nigerian', rules };
	return { ok: true, rules };
}

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkTo = (href: string, label: string) =>
	`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;

/**
 * What we post in groups, as Telegram HTML: short link labels instead of long tracking URLs
 * (the tracking still works), bold for the offer, and blank lines between sections.
 */
export const groupCopy = {
	/** A short public answer to someone asking where to buy. */
	reply: (platform: string, link: string) =>
		[
			`Hi! FastAccs has ready <b>${escapeHtml(platform)}</b> accounts, delivered instantly to your dashboard.`,
			'',
			'🎁 First order? Code <b>WELCOME10</b> = 10% off',
			`👉 ${linkTo(link, `Get ${platform} accounts`)}`
		].join('\n'),
	/** An occasional promo, only where the group's rules invite it. */
	promo: (link: string, affiliateLink: string) =>
		[
			'🚀 <b>Ready social media accounts</b>',
			'X (Twitter) · Instagram · TikTok · Facebook',
			'',
			'⚡ Delivered instantly to your FastAccs dashboard',
			'🛒 Buy one or many in one checkout',
			'',
			'🎁 First order? Code <b>WELCOME10</b> = 10% off',
			'',
			`👉 ${linkTo(link, 'Shop now at smm.fastaccs.com')}`,
			'',
			`💸 ${linkTo(affiliateLink, 'Earn by referring friends')}`,
			'📢 Updates: @FASTACCOUNT_SMM'
		].join('\n')
};
