import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/prisma', () => ({ prisma: {} }));

import { normalizeChannelInput, renderPostback, validatePostbackTemplate } from './channels';

const PROPELLER =
	'http://ad.propellerads.com/conversion.php?aid=123&pid=&tid=456&visitor_id=${SUBID}&payout=${PAYOUT}';

describe('validatePostbackTemplate', () => {
	it('accepts a network URL with a click id token', () => {
		expect(validatePostbackTemplate(`  ${PROPELLER} `)).toBe(PROPELLER);
	});
	it('treats an empty template as "no postbacks"', () => {
		expect(validatePostbackTemplate('   ')).toBeNull();
	});
	it('rejects URLs without a click id token or with odd schemes', () => {
		expect(() => validatePostbackTemplate('https://example.com/pb?x=1')).toThrow(/click id/);
		expect(() => validatePostbackTemplate('javascript:alert(1)//${SUBID}')).toThrow();
		expect(() => validatePostbackTemplate('not a url')).toThrow();
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
			postbackTemplate: PROPELLER,
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
