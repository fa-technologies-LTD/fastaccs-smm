import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(
	() => ({ CRON_SECRET: 'cron-secret', ATTRIBUTION_SIGNING_SECRET: '' }) as Record<string, string>
);
vi.mock('$env/dynamic/private', () => ({ env }));

import {
	CONSENT_COOKIE,
	readServerAttribution,
	signCookieValue,
	syncAttributionCookies,
	verifyCookieValue
} from './attribution-cookies';
import { CONSENT_TTL_MS } from '$lib/helpers/privacyConsent';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const AD = new URL(
	'https://smm.fastaccs.com/platforms/x?utm_source=propellerads&utm_medium=push&utm_campaign=183788&utm_content=5551&fa_click=abc123'
);
const PLAIN = new URL('https://smm.fastaccs.com/platforms/x');

function jar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		get: (name: string) => values.get(name),
		getAll: () => [...values].map(([name, value]) => ({ name, value })),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name),
		serialize: () => ''
	};
}

const sync = (
	cookies: ReturnType<typeof jar>,
	level: Parameters<typeof syncAttributionCookies>[0]['level'],
	landing: URL | null = AD,
	now = NOW
) =>
	syncAttributionCookies({
		cookies: cookies as never,
		level,
		landing,
		referrer: '',
		ownHost: 'smm.fastaccs.com',
		now
	});

beforeEach(() => {
	env.CRON_SECRET = 'cron-secret';
	env.ATTRIBUTION_SIGNING_SECRET = '';
});

describe('signing', () => {
	it('round-trips and rejects tampering, renaming and missing keys', () => {
		const signed = signCookieValue('fa_lt', { a: 1 })!;
		expect(verifyCookieValue('fa_lt', signed)).toEqual({ a: 1 });
		expect(verifyCookieValue('fa_attr', signed)).toBeNull(); // bound to the cookie name
		expect(
			verifyCookieValue('fa_lt', signed.replace(/.$/, signed.endsWith('A') ? 'B' : 'A'))
		).toBeNull();
		expect(verifyCookieValue('fa_lt', '{"a":1}')).toBeNull(); // unsigned legacy JSON
		env.CRON_SECRET = '';
		expect(signCookieValue('fa_lt', { a: 1 })).toBeNull();
		expect(verifyCookieValue('fa_lt', signed)).toBeNull();
	});

	it('prefers a dedicated secret when configured', () => {
		const derived = signCookieValue('x', 1)!;
		env.ATTRIBUTION_SIGNING_SECRET = 'dedicated';
		expect(verifyCookieValue('x', derived)).toBeNull();
	});
});

describe('readServerAttribution (server-side current consent)', () => {
	it('ignores valid attribution cookies when there is no consent record', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		cookies.values.delete(CONSENT_COOKIE);
		expect(readServerAttribution(cookies, NOW)).toEqual({
			consentLevel: null,
			first: null,
			last: null
		});
	});

	it('exposes only what the current level allows', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		const full = readServerAttribution(cookies, NOW);
		expect(full.consentLevel).toBe('marketing');
		expect(full.first?.source).toBe('propellerads');
		expect(full.last?.clickId).toBe('abc123');

		// A stale ad-click cookie left behind after a downgrade is not usable.
		const stale = cookies.values.get('fa_lt')!;
		sync(cookies, 'analytics');
		cookies.values.set('fa_lt', stale);
		expect(readServerAttribution(cookies, NOW)).toMatchObject({
			consentLevel: 'analytics',
			last: null
		});
	});

	it('expires consent after the banner TTL and on version mismatch', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		expect(
			readServerAttribution(cookies, new Date(NOW.getTime() + CONSENT_TTL_MS + 1)).consentLevel
		).toBeNull();
		cookies.values.set(
			CONSENT_COOKIE,
			signCookieValue(CONSENT_COOKIE, { level: 'marketing', v: 999, at: NOW.getTime() })!
		);
		expect(readServerAttribution(cookies, NOW).consentLevel).toBeNull();
	});
});

describe('syncAttributionCookies enforces the complete level', () => {
	it('marketing sets consent, first touch and the ad click', () => {
		const cookies = jar();
		expect(sync(cookies, 'marketing')).toEqual({
			level: 'marketing',
			first: true,
			last: true,
			signing: true
		});
		expect([...cookies.values.keys()].sort()).toEqual(['fa_attr', 'fa_consent', 'fa_lt']);
	});

	it('analytics removes an existing ad click and never creates one', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		expect(sync(cookies, 'analytics')).toMatchObject({ first: true, last: false });
		expect(cookies.values.has('fa_lt')).toBe(false);
	});

	it('necessary removes both touches; no choice removes everything', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		sync(cookies, 'necessary');
		expect([...cookies.values.keys()]).toEqual(['fa_consent']);
		expect(readServerAttribution(cookies, NOW).consentLevel).toBe('necessary');
		sync(cookies, null);
		expect(cookies.values.size).toBe(0);
	});

	it('keeps the original first touch and the latest valid ad click on untagged pages', () => {
		const cookies = jar();
		sync(cookies, 'marketing');
		const first = cookies.values.get('fa_attr');
		expect(sync(cookies, 'marketing', PLAIN)).toMatchObject({ first: true, last: true });
		expect(cookies.values.get('fa_attr')).toBe(first);
	});

	it('converges on the last processed choice regardless of earlier calls', () => {
		const cookies = jar();
		sync(cookies, 'necessary');
		sync(cookies, 'marketing');
		sync(cookies, 'necessary');
		expect(readServerAttribution(cookies, NOW)).toEqual({
			consentLevel: 'necessary',
			first: null,
			last: null
		});
	});

	it('fails closed without a signing key', () => {
		env.CRON_SECRET = '';
		const cookies = jar({ fa_lt: 'old', fa_attr: 'old', fa_consent: 'old' });
		expect(sync(cookies, 'marketing')).toEqual({
			level: null,
			first: false,
			last: false,
			signing: false
		});
		expect(cookies.values.size).toBe(0);
	});
});
