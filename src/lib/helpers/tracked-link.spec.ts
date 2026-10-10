import { describe, it, expect } from 'vitest';
import {
	buildNetworkTemplateUrl,
	buildTrackedUrl,
	hasNetworkMacros,
	slugifyUtm
} from './tracked-link';
import { buildFirstTouch, buildLastTouch } from '$lib/services/attribution';

const base = 'https://smm.fastaccs.com';

describe('slugifyUtm', () => {
	it('lowercases and replaces unsafe characters', () => {
		expect(slugifyUtm('  Sports Board / Oct ')).toBe('sports-board-oct');
		expect(slugifyUtm('WhatsApp_TV.1')).toBe('whatsapp_tv.1');
	});
	it('caps length', () => {
		expect(slugifyUtm('a'.repeat(100))).toHaveLength(60);
	});
});

describe('buildTrackedUrl', () => {
	it('builds a fully tagged link', () => {
		expect(
			buildTrackedUrl({
				baseUrl: base,
				path: '/platforms/x',
				source: 'Nairaland',
				medium: 'forum',
				campaign: 'Sports Oct',
				content: 'banner 1'
			})
		).toBe(
			'https://smm.fastaccs.com/platforms/x?utm_source=nairaland&utm_medium=forum&utm_campaign=sports-oct&utm_content=banner-1'
		);
	});
	it('omits empty optional tags and normalizes the path', () => {
		expect(buildTrackedUrl({ baseUrl: base, path: 'numbers', source: 'telegram' })).toBe(
			'https://smm.fastaccs.com/numbers?utm_source=telegram'
		);
	});
	it('refuses a link with no usable source', () => {
		expect(buildTrackedUrl({ baseUrl: base, path: '/', source: '  !! ' })).toBeNull();
	});
	it('produces links the first-touch capture credits correctly', () => {
		const url = new URL(
			buildTrackedUrl({
				baseUrl: base,
				path: '/platforms/x',
				source: 'nairaland',
				medium: 'forum',
				campaign: 'sports-oct'
			})!
		);
		expect(
			buildFirstTouch({
				searchParams: url.searchParams,
				referrer: '',
				pathname: url.pathname,
				ownHost: 'smm.fastaccs.com'
			})
		).toMatchObject({ source: 'nairaland', medium: 'forum', campaign: 'sports-oct' });
	});
});

describe('buildNetworkTemplateUrl', () => {
	it('keeps PropellerAds placeholders unencoded for the network to fill', () => {
		expect(
			buildNetworkTemplateUrl({
				baseUrl: base,
				path: '/platforms/x',
				source: 'PropellerAds',
				medium: 'push'
			})
		).toBe(
			'https://smm.fastaccs.com/platforms/x?utm_source=propellerads&utm_medium=push&utm_campaign={campaignid}&utm_content={zoneid}&fa_click=${SUBID}'
		);
		expect(hasNetworkMacros('propellerads')).toBe(true);
	});

	it('returns null for sources without known macros', () => {
		expect(buildNetworkTemplateUrl({ baseUrl: base, path: '/', source: 'nairaland' })).toBeNull();
		expect(hasNetworkMacros('nairaland')).toBe(false);
	});

	it('produces a last touch with the filled click id once the network substitutes it', () => {
		const filled = buildNetworkTemplateUrl({
			baseUrl: base,
			path: '/platforms/x',
			source: 'propellerads',
			medium: 'push'
		})!
			.replace('{campaignid}', '183788')
			.replace('{zoneid}', '5551')
			.replace('${SUBID}', 'abc123');
		const url = new URL(filled);
		expect(
			buildLastTouch({
				searchParams: url.searchParams,
				pathname: url.pathname,
				now: new Date('2026-10-10T00:00:00Z')
			})
		).toMatchObject({
			source: 'propellerads',
			campaign: '183788',
			content: '5551',
			clickId: 'abc123'
		});
	});
});
