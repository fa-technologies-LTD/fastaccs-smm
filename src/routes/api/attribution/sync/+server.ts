import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeRequestAllowance } from '$lib/server/request-rate-limit';
import { syncAttributionCookies } from '$lib/server/attribution-cookies';
import type { AttributionConsentLevel } from '$lib/services/attribution';

/**
 * Converge acquisition cookies on the visitor's current cookie choice (Nigeria GAID 2025).
 * Body: { consent: 'necessary' | 'analytics' | 'marketing' | null, landing?: '/path?query',
 * referrer?: string }. Every call enforces the complete level (sets what it allows, deletes what
 * it doesn't), so retries and out-of-order requests are safe. The landing URL stays in browser
 * memory until the visitor decides; nothing is stored on landing.
 */

const MAX_FIELD = 500;
const LEVELS = new Set(['necessary', 'analytics', 'marketing']);

function fail(error: string, status = 400) {
	return json({ ok: false, error }, { status });
}

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	if (
		!consumeRequestAllowance({
			namespace: 'attribution-sync',
			request,
			getClientAddress,
			limit: 30,
			windowMs: 60_000
		})
	) {
		return json({ ok: false }, { status: 429, headers: { 'retry-after': '60' } });
	}

	const body: unknown = await request.json().catch(() => undefined);
	if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid body');
	const input = body as Record<string, unknown>;

	const consent = input.consent;
	if (consent !== null && !(typeof consent === 'string' && LEVELS.has(consent))) {
		return fail('Invalid consent');
	}

	let landing: URL | null = null;
	if (input.landing !== undefined && input.landing !== null) {
		const raw = String(input.landing);
		if (!raw.startsWith('/') || raw.startsWith('//') || raw.length > MAX_FIELD) {
			return fail('Invalid landing');
		}
		try {
			landing = new URL(raw, url.origin);
		} catch {
			return fail('Invalid landing');
		}
		if (landing.origin !== url.origin) return fail('Invalid landing');
	}

	const result = syncAttributionCookies({
		cookies,
		level: consent as AttributionConsentLevel | null,
		landing,
		referrer: String(input.referrer ?? '').slice(0, MAX_FIELD),
		ownHost: url.host,
		now: new Date()
	});
	return json({ ok: true, ...result });
};
