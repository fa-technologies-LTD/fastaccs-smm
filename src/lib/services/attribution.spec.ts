import { describe, it, expect } from 'vitest';
import {
	deriveSource,
	buildFirstTouch,
	parseAttribution,
	attributionToUserFields
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
		const a = buildFirstTouch({ ...base, searchParams: new URLSearchParams(), referrer: 'https://snapchat.com/' });
		expect(a).toMatchObject({ source: 'snapchat', medium: 'referral' });
	});
	it('returns null for internal navigation with no utm (nothing to attribute)', () => {
		expect(
			buildFirstTouch({ ...base, searchParams: new URLSearchParams(), referrer: 'https://smm.fastaccs.com/' })
		).toBeNull();
	});
	it('captures direct (no referrer, no utm)', () => {
		expect(buildFirstTouch({ ...base, searchParams: new URLSearchParams() })?.source).toBe('direct');
	});
});

describe('parseAttribution + attributionToUserFields', () => {
	it('round-trips a stored cookie', () => {
		const a = { source: 'snapchat', medium: 'cpc', campaign: 'aug', referrer: 'r', landing: '/numbers' };
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
			attributionToUserFields({ source: 'google', medium: '', campaign: '', referrer: '', landing: '/' })
		).toMatchObject({ acquisitionSource: 'google', acquisitionMedium: null });
	});
});
