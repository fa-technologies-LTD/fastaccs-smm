/**
 * First-touch acquisition attribution. On a visitor's first landing we derive where they came
 * from (utm_source, else the referrer domain) and stash it in a first-party cookie; at signup we
 * persist it on the user so "which channel drives signups AND revenue" is answerable in-app.
 */

export const ATTRIBUTION_COOKIE = 'fa_attr';
export const ATTRIBUTION_MAX_AGE_S = 60 * 60 * 24 * 90; // 90 days

export interface Attribution {
	source: string; // 'snapchat' | 'google' | 'direct' | a bare domain | a utm_source value
	medium: string; // 'referral' | utm_medium | ''
	campaign: string;
	referrer: string;
	landing: string;
}

// Referrer host → canonical channel. First match wins.
const KNOWN_SOURCES: Array<[RegExp, string]> = [
	[/snapchat\.com|snap(chat|kit)?/i, 'snapchat'],
	[/(facebook|fb)\.com|fb\.me|fbclid/i, 'facebook'],
	[/instagram\.com/i, 'instagram'],
	[/tiktok\.com/i, 'tiktok'],
	[/(twitter|x)\.com|t\.co/i, 'twitter'],
	[/youtube\.com|youtu\.be/i, 'youtube'],
	[/t\.me|telegram/i, 'telegram'],
	[/whatsapp|wa\.me/i, 'whatsapp'],
	[/google\./i, 'google'],
	[/bing\./i, 'bing'],
	[/duckduckgo\./i, 'duckduckgo'],
	[/reddit\.com/i, 'reddit'],
	[/linkedin\.com/i, 'linkedin']
];

/** Map a referrer URL to a channel. '' = internal/unattributable; 'direct' = no referrer. */
export function deriveSource(referrer: string, ownHost: string): string {
	if (!referrer) return 'direct';
	let host = '';
	try {
		host = new URL(referrer).host.toLowerCase();
	} catch {
		return '';
	}
	if (!host) return 'direct';
	// Our own domain(s) = internal navigation, not an acquisition source.
	if (host === (ownHost || '').toLowerCase() || host.endsWith('fastaccs.com')) return '';
	for (const [re, name] of KNOWN_SOURCES) if (re.test(host)) return name;
	return host.replace(/^www\./, ''); // unknown external → the bare domain
}

function clip(v: string | null | undefined, max: number): string {
	return String(v ?? '')
		.trim()
		.slice(0, max);
}

/**
 * Build the first-touch record from a landing request. Returns null when there's nothing worth
 * attributing (e.g. an internal navigation with no utm), so the caller skips setting the cookie.
 */
export function buildFirstTouch(input: {
	searchParams: URLSearchParams;
	referrer: string;
	pathname: string;
	ownHost: string;
}): Attribution | null {
	const utmSource = clip(input.searchParams.get('utm_source'), 60);
	const hasSnapClickId = Array.from(input.searchParams.entries()).some(
		([key, value]) => key.toLowerCase() === 'sccid' && value.trim().length > 0
	);
	const source =
		utmSource || (hasSnapClickId ? 'snapchat' : deriveSource(input.referrer, input.ownHost));
	if (!source) return null; // internal nav, no utm → not attributable
	return {
		source: source.toLowerCase(),
		medium:
			clip(input.searchParams.get('utm_medium'), 60) ||
			(utmSource ? '' : hasSnapClickId ? 'paid_social' : 'referral'),
		campaign: clip(input.searchParams.get('utm_campaign'), 80),
		referrer: clip(input.referrer, 200),
		landing: clip(input.pathname, 200)
	};
}

/** Map an Attribution to the User acquisition_* columns (empty object when there's nothing). */
export function attributionToUserFields(a: Attribution | null): {
	acquisitionSource?: string | null;
	acquisitionMedium?: string | null;
	acquisitionCampaign?: string | null;
	acquisitionReferrer?: string | null;
	acquisitionLanding?: string | null;
} {
	if (!a) return {};
	return {
		acquisitionSource: a.source || null,
		acquisitionMedium: a.medium || null,
		acquisitionCampaign: a.campaign || null,
		acquisitionReferrer: a.referrer || null,
		acquisitionLanding: a.landing || null
	};
}

/**
 * Last tagged touch. Unlike first-touch, this is overwritten by every landing that carries a
 * tracking tag (utm_source, our fa_click, or a Snap ScCid), so a paid click is credited even when
 * the visitor first arrived some other way. Kept short-lived: a click older than the window should
 * not claim the sale.
 */
export const LAST_TOUCH_COOKIE = 'fa_lt';
export const LAST_TOUCH_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

export interface LastTouch {
	source: string;
	medium: string;
	campaign: string;
	content: string; // utm_content: the placement / zone / creative
	clickId: string; // the ad network's click id, echoed back in conversion postbacks
	landing: string;
	landedAt: string; // ISO timestamp
}

export interface RequestAttribution {
	first: Attribution | null;
	last: LastTouch | null;
}

// Network click ids are opaque tokens; keep only URL-safe characters so they can be echoed back
// into a postback URL verbatim.
function cleanClickId(v: string | null | undefined): string {
	return String(v ?? '')
		.replace(/[^A-Za-z0-9._~:-]/g, '')
		.slice(0, 128);
}

function getParamCaseInsensitive(params: URLSearchParams, name: string): string {
	for (const [key, value] of params.entries()) {
		if (key.toLowerCase() === name && value.trim()) return value;
	}
	return '';
}

/** Build the last-touch record from a landing request. Null when the landing carries no tag. */
export function buildLastTouch(input: {
	searchParams: URLSearchParams;
	pathname: string;
	now: Date;
}): LastTouch | null {
	const utmSource = clip(input.searchParams.get('utm_source'), 60).toLowerCase();
	const faClick = cleanClickId(input.searchParams.get('fa_click'));
	const snapClick = cleanClickId(getParamCaseInsensitive(input.searchParams, 'sccid'));
	const source = utmSource || (snapClick ? 'snapchat' : '');
	if (!source) return null; // a bare fa_click with no source can't be credited to a channel
	return {
		source,
		medium:
			clip(input.searchParams.get('utm_medium'), 60) ||
			(snapClick && !utmSource ? 'paid_social' : ''),
		campaign: clip(input.searchParams.get('utm_campaign'), 80),
		content: clip(input.searchParams.get('utm_content'), 120),
		clickId: faClick || snapClick,
		landing: clip(input.pathname, 200),
		landedAt: input.now.toISOString()
	};
}

/** Parse the last-touch cookie; null when missing, corrupt or older than the window. */
export function parseLastTouch(raw: string | undefined | null, now: Date): LastTouch | null {
	if (!raw) return null;
	try {
		const o = JSON.parse(raw) as Partial<LastTouch>;
		if (!o || typeof o.source !== 'string' || !o.source) return null;
		const landedAtMs = Date.parse(String(o.landedAt ?? ''));
		if (!Number.isFinite(landedAtMs)) return null;
		if (now.getTime() - landedAtMs > LAST_TOUCH_MAX_AGE_S * 1000) return null;
		return {
			source: clip(o.source, 60),
			medium: clip(o.medium, 60),
			campaign: clip(o.campaign, 80),
			content: clip(o.content, 120),
			clickId: cleanClickId(o.clickId),
			landing: clip(o.landing, 200),
			landedAt: new Date(landedAtMs).toISOString()
		};
	} catch {
		return null;
	}
}

/** Parse the stored cookie back into an Attribution (null if missing/corrupt). */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
	if (!raw) return null;
	try {
		const o = JSON.parse(raw) as Partial<Attribution>;
		if (!o || typeof o.source !== 'string' || !o.source) return null;
		return {
			source: o.source,
			medium: o.medium ?? '',
			campaign: o.campaign ?? '',
			referrer: o.referrer ?? '',
			landing: o.landing ?? ''
		};
	} catch {
		return null;
	}
}
