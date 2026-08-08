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
	const source = utmSource || deriveSource(input.referrer, input.ownHost);
	if (!source) return null; // internal nav, no utm → not attributable
	return {
		source: source.toLowerCase(),
		medium: clip(input.searchParams.get('utm_medium'), 60) || (utmSource ? '' : 'referral'),
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
