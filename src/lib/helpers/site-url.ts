import { env } from '$env/dynamic/public';

const FALLBACK_BASE_URL = 'https://smm.fastaccs.com';

/**
 * Canonical public origin for the site (no trailing slash), used for
 * sitemap/canonical/OG URLs. Falls back to the production domain if
 * PUBLIC_BASE_URL is unset or invalid.
 */
export function getSiteBaseUrl(): string {
	const trimmed = String(env.PUBLIC_BASE_URL || '').trim();
	if (!trimmed) return FALLBACK_BASE_URL;

	try {
		return new URL(trimmed).origin.replace(/\/+$/, '');
	} catch {
		return FALLBACK_BASE_URL;
	}
}

/**
 * Payment providers must return production buyers to the public storefront,
 * even when the app is behind an internal proxy. Explicit localhost payment
 * testing keeps its local origin so the browser can complete the same flow.
 */
export function getPaymentReturnOrigin(requestUrl: URL): string {
	const hostname = requestUrl.hostname.toLowerCase();
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
		return requestUrl.origin;
	}
	return getSiteBaseUrl();
}
