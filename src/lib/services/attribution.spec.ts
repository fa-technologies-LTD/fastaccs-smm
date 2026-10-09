import { describe, it, expect } from 'vitest';
import {
	deriveSource,
	buildFirstTouch,
	buildLastTouch,
	parseAttribution,
	parseLastTouch,
	attributionToUserFields,
	LAST_TOUCH_MAX_AGE_S
} from './attribution';

describe('deriveSource', () => {
	it('maps known referrers to canonical channels', () => {
		expect(deriveSource('https://www.snapchat.com/', 'smm.fastaccs.com')).toBe('snapchat');
		expect(deriveSource('https://www.google.com/search?q=x', 'smm.fastaccs.com')).toBe('google');
		expect(deriveSource('https://t.co/abc', 'smm.fastaccs.com')).toBe('twitter');
	});
	it('treats no referrer as direct', () => {
		expect(deriveSource('', 'smm.fastaccs.com')).toBe('direct');
	});
	it('treats our own domain as internal (not an acquisition)', () => {
		expect(deriveSource('https://smm.fastaccs.com/numbers', 'smm.fastaccs.com')).toBe('');
		expect(deriveSource('https://gifting.fastaccs.com/', 'smm.fastaccs.com')).toBe('');
	});
	it('falls back to the bare domain for unknown external referrers', () => {
		expect(deriveSource('https://www.somenewsite.io/x', 'smm.fastaccs.com')).toBe('somenewsite.io');
	});
});

describe('buildFirstTouch', () => {
	const base = { referrer: '', pathname: '/numbers', ownHost: 'smm.fastaccs.com' };

	it('prefers utm_source over referrer and captures medium/campaign', () => {
		const a = buildFirstTouch({
			...base,
			searchParams: new URLSearchParams('utm_source=snapchat&utm_medium=cpc&utm_campaign=aug'),
			referrer: 'https://google.com/'
		});
		expect(a).toMatchObject({ source: 'snapchat', medium: 'cpc', campaign: 'aug' });
	});
	it('derives from referrer when no utm, defaulting medium to referral', () => {
		const a = buildFirstTouch({
			...base,
			searchParams: new URLSearchParams(),
			referrer: 'https://snapchat.com/'
		});
		expect(a).toMatchObject({ source: 'snapchat', medium: 'referral' });
	});
	it('recognizes Snap ad click IDs even when the in-app browser sends no referrer', () => {
		const a = buildFirstTouch({
			...base,
			searchParams: new URLSearchParams('ScCid=example-click-id')
		});
		expect(a).toMatchObject({ source: 'snapchat', medium: 'paid_social' });
	});
	it('returns null for internal navigation with no utm (nothing to attribute)', () => {
		expect(
			buildFirstTouch({
				...base,
				searchParams: new URLSearchParams(),
				referrer: 'https://smm.fastaccs.com/'
			})
		).toBeNull();
	});
	it('captures direct (no referrer, no utm)', () => {
		expect(buildFirstTouch({ ...base, searchParams: new URLSearchParams() })?.source).toBe(
			'direct'
		);
	});
});

describe('parseAttribution + attributionToUserFields', () => {
	it('round-trips a stored cookie', () => {
		const a = {
			source: 'snapchat',
			medium: 'cpc',
			campaign: 'aug',
			referrer: 'r',
			landing: '/numbers'
		};
		expect(parseAttribution(JSON.stringify(a))).toEqual(a);
	});
	it('returns null for missing/corrupt cookies', () => {
		expect(parseAttribution(undefined)).toBeNull();
		expect(parseAttribution('not json')).toBeNull();
		expect(parseAttribution('{"medium":"x"}')).toBeNull(); // no source
	});
	it('maps to user columns, empty object when null', () => {
		expect(attributionToUserFields(null)).toEqual({});
		expect(
			attributionToUserFields({
				source: 'google',
				medium: '',
				campaign: '',
				referrer: '',
				landing: '/'
			})
		).toMatchObject({ acquisitionSource: 'google', acquisitionMedium: null });
	});
});

describe('buildLastTouch', () => {
	const now = new Date('2026-10-09T12:00:00.000Z');
	const touch = (query: string, pathname = '/numbers/whatsapp/usa') =>
		buildLastTouch({ searchParams: new URLSearchParams(query), pathname, now });

	it('captures a tagged ad landing with placement and click id', () => {
		expect(
			touch(
				'utm_source=PropellerAds&utm_medium=push&utm_campaign=wa-usa&utm_content=zone-123&fa_click=abc123'
			)
		).toEqual({
			source: 'propellerads',
			medium: 'push',
			campaign: 'wa-usa',
			content: 'zone-123',
			clickId: 'abc123',
			landing: '/numbers/whatsapp/usa',
			landedAt: '2026-10-09T12:00:00.000Z'
		});
	});
	it('treats a utm-tagged direct buy (no click id) as a touch', () => {
		expect(touch('utm_source=nairaland&utm_medium=forum&utm_content=sports')).toMatchObject({
			source: 'nairaland',
			content: 'sports',
			clickId: ''
		});
	});
	it('credits Snap click ids without utm', () => {
		expect(touch('ScCid=snap-1')).toMatchObject({
			source: 'snapchat',
			medium: 'paid_social',
			clickId: 'snap-1'
		});
	});
	it('ignores untagged landings and bare click ids with no source', () => {
		expect(touch('')).toBeNull();
		expect(touch('fa_click=orphan')).toBeNull();
	});
	it('strips unsafe characters from click ids and caps their length', () => {
		expect(touch('utm_source=x&fa_click=a%20b%22c%3Cd')?.clickId).toBe('abcd');
		expect(touch(`utm_source=x&fa_click=${'z'.repeat(300)}`)?.clickId).toHaveLength(128);
	});
});

describe('parseLastTouch', () => {
	const now = new Date('2026-10-09T12:00:00.000Z');
	const stored = {
		source: 'propellerads',
		medium: 'push',
		campaign: 'c',
		content: 'z',
		clickId: 'abc',
		landing: '/numbers',
		landedAt: '2026-10-08T12:00:00.000Z'
	};

	it('round-trips a stored cookie inside the window', () => {
		expect(parseLastTouch(JSON.stringify(stored), now)).toEqual(stored);
	});
	it('expires touches older than the window', () => {
		const old = new Date(now.getTime() - LAST_TOUCH_MAX_AGE_S * 1000 - 1).toISOString();
		expect(parseLastTouch(JSON.stringify({ ...stored, landedAt: old }), now)).toBeNull();
	});
	it('returns null for missing, corrupt, sourceless or undated cookies', () => {
		expect(parseLastTouch(undefined, now)).toBeNull();
		expect(parseLastTouch('not json', now)).toBeNull();
		expect(parseLastTouch(JSON.stringify({ ...stored, source: '' }), now)).toBeNull();
		expect(parseLastTouch(JSON.stringify({ ...stored, landedAt: 'nope' }), now)).toBeNull();
	});
	it('re-sanitizes a tampered click id', () => {
		expect(
			parseLastTouch(JSON.stringify({ ...stored, clickId: 'ok"><script>' }), now)?.clickId
		).toBe('okscript');
	});
});
