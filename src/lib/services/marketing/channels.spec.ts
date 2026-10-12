import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/prisma', () => ({ prisma: {} }));

import {
	assertPostbackUrlAllowed,
	channelReportsConversions,
	normalizeChannelInput,
	renderPostback,
	validatePostbackTemplate
} from './channels';

const PROPELLER =
	'http://ad.propellerads.com/conversion.php?aid=123&pid=&tid=456&visitor_id=${SUBID}&payout=${PAYOUT}';

describe('validatePostbackTemplate (outbound safety)', () => {
	it('accepts the network URL and upgrades http to https', () => {
		expect(validatePostbackTemplate(`  ${PROPELLER} `, 'propellerads')).toBe(
			PROPELLER.replace('http://', 'https://')
		);
	});
	it('treats an empty template as "no postbacks"', () => {
		expect(validatePostbackTemplate('   ', 'propellerads')).toBeNull();
	});
	it.each([
		['loopback', 'http://127.0.0.1:3000/internal?click=${SUBID}'],
		['another host', 'https://evil.example/pb?c=${SUBID}'],
		['a look-alike host', 'https://ad.propellerads.com.evil.example/pb?c=${SUBID}'],
		['credentials', 'https://user:pass@ad.propellerads.com/pb?c=${SUBID}'],
		['an unusual port', 'https://ad.propellerads.com:8443/pb?c=${SUBID}'],
		['another scheme', 'ftp://ad.propellerads.com/pb?c=${SUBID}'],
		['no click id token', 'https://ad.propellerads.com/conversion.php?aid=1'],
		['not a URL', 'not a url']
	])('rejects %s', (_name, url) => {
		expect(() => validatePostbackTemplate(url, 'propellerads')).toThrow();
	});
	it('refuses channels without a reviewed network host', () => {
		expect(() =>
			validatePostbackTemplate('https://ad.propellerads.com/x?c=${SUBID}', 'nairaland')
		).toThrow(/not supported/);
	});
	it('re-checks rendered URLs too', () => {
		expect(
			assertPostbackUrlAllowed(
				'https://ad.propellerads.com/conversion.php?visitor_id=abc',
				'propellerads'
			)
		).toBe('https://ad.propellerads.com/conversion.php?visitor_id=abc');
	});
});

describe('channelReportsConversions', () => {
	it('reports for testing, scaling and paused; never for stopped', () => {
		expect(['testing', 'scaling', 'paused', 'killed'].map(channelReportsConversions)).toEqual([
			true,
			true,
			true,
			false
		]);
	});
});

describe('renderPostback', () => {
	it('fills click id and payout, URL-encoding the click id', () => {
		expect(renderPostback(PROPELLER, { clickId: 'ab c&d', payoutUsd: 3.456 })).toBe(
			'http://ad.propellerads.com/conversion.php?aid=123&pid=&tid=456&visitor_id=ab%20c%26d&payout=3.46'
		);
	});
	it('supports other token spellings', () => {
		expect(
			renderPostback('https://t.example/pb?cid={click_id}&p={payout}', {
				clickId: 'x1',
				payoutUsd: 0
			})
		).toBe('https://t.example/pb?cid=x1&p=0');
	});
});

describe('normalizeChannelInput', () => {
	it('slugs the key, validates enums and amounts', () => {
		expect(
			normalizeChannelInput({
				key: 'PropellerAds',
				name: 'PropellerAds',
				kind: 'network',
				status: 'testing',
				targetCacNgn: '2600',
				dailyCapNgn: 5000,
				postbackTemplate: PROPELLER,
				dedupByClickId: 'yes'
			})
		).toEqual({
			key: 'propellerads',
			name: 'PropellerAds',
			kind: 'network',
			status: 'testing',
			targetCacNgn: 2600,
			dailyCapNgn: 5000,
			postbackTemplate: PROPELLER.replace('http://', 'https://'),
			dedupByClickId: false, // only an explicit boolean true turns retries on
			notes: null
		});
	});
	it('rejects unknown kinds, statuses, negative amounts and empty keys', () => {
		expect(() => normalizeChannelInput({ key: 'x', kind: 'tv' })).toThrow();
		expect(() => normalizeChannelInput({ key: 'x', status: 'live' })).toThrow();
		expect(() => normalizeChannelInput({ key: 'x', targetCacNgn: -5 })).toThrow();
		expect(() => normalizeChannelInput({ key: '!!' })).toThrow();
	});
});
