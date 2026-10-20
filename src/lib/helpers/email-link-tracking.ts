/**
 * Tracking tags on links in marketing and reminder emails, so a click shows up as a visit
 * (source "email") and, when the buyer orders within the attribution window, against the order.
 * Order, account-security and affiliate emails stay untagged: a "view your order" click must not
 * take the credit for a sale away from the ad or campaign that actually brought the buyer.
 */

const TAGGED_EMAIL_TYPES = new Set([
	'welcome',
	'onboarding_step',
	'nurture_step',
	'abandoned_order',
	'restock_alert',
	'boosting_service_live',
	'win_back',
	'marketing_campaign',
	'numbers_launch',
	'numbers_recovery',
	'store_credit_reminder',
	'promo_reminder',
	'promo_credit',
	'admin_broadcast'
]);

export function shouldTagEmailLinks(notificationType: string, classification?: string): boolean {
	return classification === 'marketing' || TAGGED_EMAIL_TYPES.has(notificationType);
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which email in a sequence, without anything that identifies the person: "nurture:step_2:<user>"
 * → "step_2"; a broadcast → "b-<first 8 of its id>".
 */
export function emailUtmContent(referenceId?: string | null, broadcastId?: string | null): string {
	if (broadcastId) return `b-${broadcastId.slice(0, 8)}`;
	const parts = String(referenceId ?? '')
		.split(':')
		.slice(1)
		.filter((part) => part && !UUID_LIKE.test(part) && !/^[0-9a-f]{16,}$/i.test(part));
	return parts
		.join('-')
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.slice(0, 60);
}

/** Add utm tags to a link on our own site that has none yet; anything else is left untouched. */
export function tagEmailLink(
	rawUrl: string | null | undefined,
	options: { siteHosts: readonly string[]; campaign: string; content?: string }
): string | null | undefined {
	if (!rawUrl) return rawUrl;
	let url: URL;
	try {
		url = new URL(rawUrl.trim());
	} catch {
		return rawUrl;
	}
	if (!options.siteHosts.includes(url.hostname.toLowerCase())) return rawUrl;
	if (url.searchParams.has('utm_source')) return rawUrl;
	url.searchParams.set('utm_source', 'email');
	url.searchParams.set('utm_medium', 'email');
	url.searchParams.set('utm_campaign', options.campaign);
	if (options.content) url.searchParams.set('utm_content', options.content);
	return url.toString();
}

/** Tag our own links inside a markdown-style email body ("[text](https://...)"). */
export function tagEmailBodyLinks(
	body: string,
	options: { siteHosts: readonly string[]; campaign: string; content?: string }
): string {
	return body.replace(
		/\]\((https?:\/\/[^\s)]+)\)/g,
		(_match, url: string) => `](${tagEmailLink(url, options) ?? url})`
	);
}
