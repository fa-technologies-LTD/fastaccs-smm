import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import {
	ATTRIBUTION_COOKIE,
	ATTRIBUTION_MAX_AGE_S,
	LAST_TOUCH_COOKIE,
	LAST_TOUCH_MAX_AGE_S,
	buildFirstTouch,
	buildLastTouch,
	normalizeAttribution,
	normalizeLastTouch,
	type AttributionConsentLevel,
	type RequestAttribution
} from '$lib/services/attribution';
import { CONSENT_TTL_MS, CONSENT_VERSION } from '$lib/helpers/privacyConsent';

/**
 * Server-side consent record + signed acquisition cookies (Nigeria GAID 2025).
 *
 * - `fa_consent` mirrors the visitor's banner choice so the SERVER knows the current level; it is
 *   the only evidence of permission. An attribution cookie on its own (stale after a downgrade, or
 *   injected, e.g. by a sibling subdomain) is never trusted.
 * - Every value is HMAC-signed; unsigned or tampered values are ignored.
 * - `syncAttributionCookies` always enforces the COMPLETE level: setting what it allows and deleting
 *   what it doesn't, so any order of requests converges on the latest choice.
 * - No signing key → fail closed: nothing is set and nothing is read.
 */

export const CONSENT_COOKIE = 'fa_consent';
const LEVELS: readonly AttributionConsentLevel[] = ['necessary', 'analytics', 'marketing'];

function signingKey(): Buffer | null {
	const dedicated = String(env.ATTRIBUTION_SIGNING_SECRET ?? '').trim();
	if (dedicated) return Buffer.from(dedicated);
	const cron = String(env.CRON_SECRET ?? '').trim();
	// Domain-separated derivation so the cron secret itself never signs anything.
	return cron
		? createHmac('sha256', cron).update('fastaccs:attribution-cookies:v1').digest()
		: null;
}

function mac(key: Buffer, name: string, body: string): string {
	return createHmac('sha256', key).update(`${name}|${body}`).digest('base64url');
}

export function signCookieValue(name: string, payload: unknown, key = signingKey()): string | null {
	if (!key) return null;
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${mac(key, name, body)}`;
}

export function verifyCookieValue(
	name: string,
	raw: string | undefined | null,
	key = signingKey()
): unknown {
	if (!key || !raw) return null;
	const dot = raw.lastIndexOf('.');
	if (dot <= 0) return null;
	const body = raw.slice(0, dot);
	const given = Buffer.from(raw.slice(dot + 1));
	const expected = Buffer.from(mac(key, name, body));
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

interface ConsentRecord {
	level: AttributionConsentLevel;
	v: number;
	at: number;
}

export function readConsentLevel(
	cookies: Pick<Cookies, 'get'>,
	now: Date
): AttributionConsentLevel | null {
	const record = verifyCookieValue(
		CONSENT_COOKIE,
		cookies.get(CONSENT_COOKIE)
	) as Partial<ConsentRecord> | null;
	if (!record || !LEVELS.includes(record.level as AttributionConsentLevel)) return null;
	if (record.v !== CONSENT_VERSION) return null;
	const age = now.getTime() - Number(record.at);
	if (!Number.isFinite(age) || age < 0 || age > CONSENT_TTL_MS) return null;
	return record.level as AttributionConsentLevel;
}

/** What this request may use. Cookies count only as far as the current consent allows. */
export function readServerAttribution(
	cookies: Pick<Cookies, 'get'>,
	now: Date
): RequestAttribution {
	const consentLevel = readConsentLevel(cookies, now);
	const analytics = consentLevel === 'analytics' || consentLevel === 'marketing';
	return {
		consentLevel,
		first: analytics
			? normalizeAttribution(verifyCookieValue(ATTRIBUTION_COOKIE, cookies.get(ATTRIBUTION_COOKIE)))
			: null,
		last:
			consentLevel === 'marketing'
				? normalizeLastTouch(
						verifyCookieValue(LAST_TOUCH_COOKIE, cookies.get(LAST_TOUCH_COOKIE)),
						now
					)
				: null
	};
}

const cookieOptions = (maxAge: number) => ({
	path: '/',
	maxAge,
	httpOnly: true,
	sameSite: 'lax' as const
});

export interface SyncResult {
	level: AttributionConsentLevel | null;
	first: boolean;
	last: boolean;
	signing: boolean;
}

/**
 * Converge the cookies on `level` (null = no choice yet). `landing` is the visit's first URL
 * (path + query, already validated as same-site) used to create touches the level allows.
 */
export function syncAttributionCookies(input: {
	cookies: Cookies;
	level: AttributionConsentLevel | null;
	landing: URL | null;
	referrer: string;
	ownHost: string;
	now: Date;
}): SyncResult {
	const { cookies, level, landing, now } = input;
	const key = signingKey();
	const analytics = level === 'analytics' || level === 'marketing';
	const marketing = level === 'marketing';

	if (!key || level === null) {
		for (const name of [CONSENT_COOKIE, ATTRIBUTION_COOKIE, LAST_TOUCH_COOKIE]) {
			cookies.delete(name, { path: '/' });
		}
		return { level: null, first: false, last: false, signing: Boolean(key) };
	}

	cookies.set(
		CONSENT_COOKIE,
		signCookieValue(CONSENT_COOKIE, { level, v: CONSENT_VERSION, at: now.getTime() }, key)!,
		cookieOptions(Math.floor(CONSENT_TTL_MS / 1000))
	);

	let first = false;
	if (!analytics) {
		cookies.delete(ATTRIBUTION_COOKIE, { path: '/' });
	} else {
		const existing = normalizeAttribution(
			verifyCookieValue(ATTRIBUTION_COOKIE, cookies.get(ATTRIBUTION_COOKIE), key)
		);
		const touch =
			existing ??
			(landing
				? buildFirstTouch({
						searchParams: landing.searchParams,
						referrer: input.referrer,
						pathname: landing.pathname,
						ownHost: input.ownHost
					})
				: null);
		if (touch && !existing) {
			cookies.set(
				ATTRIBUTION_COOKIE,
				signCookieValue(ATTRIBUTION_COOKIE, touch, key)!,
				cookieOptions(ATTRIBUTION_MAX_AGE_S)
			);
		}
		first = Boolean(touch);
	}

	let last = false;
	if (!marketing) {
		cookies.delete(LAST_TOUCH_COOKIE, { path: '/' });
	} else {
		const fresh = landing
			? buildLastTouch({ searchParams: landing.searchParams, pathname: landing.pathname, now })
			: null;
		if (fresh) {
			cookies.set(
				LAST_TOUCH_COOKIE,
				signCookieValue(LAST_TOUCH_COOKIE, fresh, key)!,
				cookieOptions(LAST_TOUCH_MAX_AGE_S)
			);
			last = true;
		} else {
			last = Boolean(
				normalizeLastTouch(
					verifyCookieValue(LAST_TOUCH_COOKIE, cookies.get(LAST_TOUCH_COOKIE), key),
					now
				)
			);
		}
	}

	return { level, first, last, signing: true };
}
