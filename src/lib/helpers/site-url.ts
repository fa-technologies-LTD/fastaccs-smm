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
