import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ATTRIBUTION_COOKIE,
	ATTRIBUTION_MAX_AGE_S,
	LAST_TOUCH_COOKIE,
	LAST_TOUCH_MAX_AGE_S,
	buildFirstTouch,
	buildLastTouch,
	parseAttribution
} from '$lib/services/attribution';

/**
 * Consent-gated acquisition cookies (Nigeria GAID 2025: non-essential cookies need an explicit
 * choice). The browser keeps the landing URL in memory and sends it here once the visitor
 * accepts; nothing is stored on landing.
 *   analytics → first-touch source (fa_attr)
 *   marketing → also the last tagged ad click (fa_lt), used for ad-network conversion reports
 * DELETE with the new level removes whatever that level no longer allows.
 */

const MAX_FIELD = 500;
type Level = 'necessary' | 'analytics' | 'marketing';

function readLevel(value: unknown): Level | null {
	return value === 'necessary' || value === 'analytics' || value === 'marketing' ? value : null;
}

function cookieOptions(maxAge: number) {
	return { path: '/', maxAge, httpOnly: true, sameSite: 'lax' as const };
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, error: 'Invalid body' }, { status: 400 });
	}

	const level = readLevel(body.consent);
	const landing = String(body.landing ?? '');
	const referrer = String(body.referrer ?? '').slice(0, MAX_FIELD);
	if (
		!level ||
		!landing.startsWith('/') ||
		landing.startsWith('//') ||
		landing.length > MAX_FIELD
	) {
		return json({ ok: false, error: 'Invalid attribution' }, { status: 400 });
	}
	if (level === 'necessary') return json({ ok: true, first: false, last: false });

	let landingUrl: URL;
	try {
		landingUrl = new URL(landing, url.origin);
	} catch {
		return json({ ok: false, error: 'Invalid landing' }, { status: 400 });
	}

	let first = false;
	if (!parseAttribution(cookies.get(ATTRIBUTION_COOKIE))) {
		const touch = buildFirstTouch({
			searchParams: landingUrl.searchParams,
			referrer,
			pathname: landingUrl.pathname,
			ownHost: url.host
		});
		if (touch) {
			cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(touch), cookieOptions(ATTRIBUTION_MAX_AGE_S));
			first = true;
		}
	}

	let last = false;
	if (level === 'marketing') {
		const touch = buildLastTouch({
			searchParams: landingUrl.searchParams,
			pathname: landingUrl.pathname,
			now: new Date()
		});
		if (touch) {
			cookies.set(LAST_TOUCH_COOKIE, JSON.stringify(touch), cookieOptions(LAST_TOUCH_MAX_AGE_S));
			last = true;
		}
	}

	return json({ ok: true, first, last });
};

export const DELETE: RequestHandler = async ({ url, cookies }) => {
	const level = readLevel(url.searchParams.get('consent')) ?? 'necessary';
	if (level !== 'marketing') cookies.delete(LAST_TOUCH_COOKIE, { path: '/' });
	if (level === 'necessary') cookies.delete(ATTRIBUTION_COOKIE, { path: '/' });
	return json({ ok: true });
};
