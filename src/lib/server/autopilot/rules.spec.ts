import { describe, expect, it } from 'vitest';
import {
	autopilotCopy,
	channelQualifies,
	dealBrief,
	decidePrice,
	findPricesNgn,
	isOurPost,
	maxPriceFor,
	mentionedUsernames,
	nigeriaScore,
	placementCode,
	postCopy,
	promoContactCandidates,
	readReply,
	typicalViews
} from './rules';
import { AUTOPILOT_DEFAULTS, mayMessage, parseAutopilotSettings } from './settings';

describe('reading prices the way Nigerian admins write them', () => {
	it.each([
		['5k per post', [5_000]],
		['₦3,500 for 24hrs', [3_500]],
		['#4000 only', [4_000]],
		['N2500', [2_500]],
		['It is 3000 naira', [3_000]],
		['2.5k', [2_500]],
		['$5', [7_500]],
		['5,000', [5_000]]
	])('%s', (text, expected) => {
		expect(findPricesNgn(text)).toEqual(expected);
	});

	it('ignores counts, hours and phone or account numbers', () => {
		expect(findPricesNgn('2 posts, 24 hours pin, call 08031234567')).toEqual([]);
	});
});

describe('what the admin is telling us', () => {
	it('spots a single price', () => {
		expect(readReply('Hello boss, promo is 4k')).toEqual({
			intent: 'price',
			priceNgn: 4_000,
			paymentDetails: null
		});
	});

	it('spots bank details before anything else', () => {
		expect(readReply('Opay 8031234567 Musa Ibrahim').intent).toBe('payment_details');
		expect(readReply('GTB 0123456789 Ada Obi').paymentDetails).toContain('0123456789');
	});

	it('treats several different prices as unclear (left to Claude or the owner)', () => {
		expect(readReply('3k for 12hrs, 5k for 24hrs').intent).toBe('unclear');
	});

	it('spots refusals, "posted" and questions', () => {
		expect(readReply('Sorry we are not interested').intent).toBe('refuse');
		expect(readReply('Done, check the channel').intent).toBe('posted');
		expect(readReply('What do you sell?').intent).toBe('question');
	});
});

describe('deciding the price', () => {
	it('pays at most ₦2,500 per 1,000 views and ₦5,000 a post, rounded down to ₦500', () => {
		expect(maxPriceFor(1_000, AUTOPILOT_DEFAULTS)).toBe(2_500);
		expect(maxPriceFor(1_300, AUTOPILOT_DEFAULTS)).toBe(3_000);
		expect(maxPriceFor(10_000, AUTOPILOT_DEFAULTS)).toBe(5_000);
	});

	it('accepts within the limit, counters once within 1.5×, otherwise declines', () => {
		const base = { maxNgn: 4_000, remainingBudgetNgn: 15_000, alreadyCountered: false };
		expect(decidePrice({ ...base, quotedNgn: 3_500 })).toEqual({
			action: 'accept',
			priceNgn: 3_500
		});
		expect(decidePrice({ ...base, quotedNgn: 5_500 })).toEqual({
			action: 'counter',
			priceNgn: 4_000
		});
		expect(decidePrice({ ...base, quotedNgn: 5_500, alreadyCountered: true }).action).toBe(
			'decline'
		);
		expect(decidePrice({ ...base, quotedNgn: 9_000 }).action).toBe('decline');
	});

	it('never goes over what is left of the budget', () => {
		expect(
			decidePrice({
				quotedNgn: 3_000,
				maxNgn: 5_000,
				remainingBudgetNgn: 2_000,
				alreadyCountered: false
			})
		).toEqual({
			action: 'counter',
			priceNgn: 2_000
		});
		expect(
			decidePrice({
				quotedNgn: 3_000,
				maxNgn: 5_000,
				remainingBudgetNgn: 300,
				alreadyCountered: false
			})
		).toEqual({
			action: 'decline',
			reason: 'no_budget'
		});
	});
});

describe('channels', () => {
	const now = new Date('2026-10-22T12:00:00Z');
	it('uses the median of recent posts, so one viral post does not count', () => {
		expect(
			typicalViews([
				{ views: 800 },
				{ views: 900 },
				{ views: 50_000 },
				{ views: 700 },
				{ views: 1_000 }
			])
		).toBe(900);
	});

	it('wants real views, recent posts and believable numbers', () => {
		const base = {
			members: 5_000,
			avgViews: 900,
			lastPostAt: new Date('2026-10-21T12:00:00Z'),
			text: ''
		};
		expect(channelQualifies(base, AUTOPILOT_DEFAULTS, now).ok).toBe(true);
		expect(channelQualifies({ ...base, avgViews: 120 }, AUTOPILOT_DEFAULTS, now).reason).toBe(
			'few views'
		);
		expect(
			channelQualifies(
				{ ...base, lastPostAt: new Date('2026-10-01T00:00:00Z') },
				AUTOPILOT_DEFAULTS,
				now
			).reason
		).toBe('inactive');
		expect(channelQualifies({ ...base, members: 300 }, AUTOPILOT_DEFAULTS, now).reason).toBe(
			'suspicious views'
		);
	});

	it('finds the promo contact in the description, promo lines first', () => {
		expect(
			promoContactCandidates(
				'Daily airdrops 🪂 @AirdropNaija\nJoin chat @naijachat\nFor ads/promo DM @promo_boss',
				'airdropnaija'
			)
		).toEqual(['promo_boss', 'naijachat']);
	});
});

describe('our post', () => {
	it('carries the tracked link and a per-channel code', () => {
		const code = placementCode('airdrop_naija', 10);
		expect(code).toBe('TGAIRDRO10');
		expect(placementCode('airdrop_naija', 10, new Set(['TGAIRDRO10']))).toBe('TGAIRDRO102');
		const post = postCopy({
			link: 'https://smm.fastaccs.com/platforms/x?utm_source=telegram',
			code,
			percent: 10,
			days: 14
		});
		expect(post).toContain('Code TGAIRDRO10 = 10% off (ends in 14 days)');
		expect(isOurPost(post, code)).toBe(true);
		expect(isOurPost('random post', code)).toBe(false);
	});
});

describe('settings', () => {
	it('starts OFF, in test mode, with the agreed rules', () => {
		expect(parseAutopilotSettings(null)).toMatchObject({
			enabled: false,
			testMode: true,
			budgetNgn: 15_000,
			maxPerPostNgn: 5_000,
			maxPer1kViewsNgn: 2_500,
			llmModel: 'claude-opus-5-5'
		});
	});

	it('in test mode only messages the test contacts', () => {
		const settings = parseAutopilotSettings(JSON.stringify({ testContacts: ['@OwnerAccount'] }));
		expect(mayMessage(settings, 'owneraccount')).toBe(true);
		expect(mayMessage(settings, 'some_admin')).toBe(false);
		expect(mayMessage({ ...settings, testMode: false }, 'some_admin')).toBe(true);
	});
});

describe('money wording', () => {
	it('never commits to paying: the owner approves every payment', () => {
		const text = autopilotCopy.withinBudget(3_500);
		expect(text).toContain('₦3,500 is within our budget');
		expect(text).not.toMatch(/deal|agreed|will pay|paying/i);
	});

	it('the approval card says what we buy, what to expect and who gets paid', () => {
		const brief = dealBrief({
			username: 'airdrop_naija',
			title: 'Airdrop Naija',
			members: 9_000,
			avgViews: 1_800,
			priceNgn: 5_000,
			paymentDetails: 'GTB 0123456789 Ada Obi',
			post: 'THE POST',
			targetCacNgn: 2_600
		});
		expect(brief).toContain('Approve ₦5,000 for one post in Airdrop Naija');
		expect(brief).toContain('₦2,778 per 1,000 views');
		expect(brief).toContain('roughly 18–54 visits');
		expect(brief).toContain('brings 2+ new buyers');
		expect(brief).toContain('THE POST');
		expect(brief).toContain('GTB 0123456789 Ada Obi');
	});
});

describe('looking for Nigerian channels', () => {
	it('scores Nigerian signs, including ₦ and local payment apps', () => {
		expect(nigeriaScore('Daily airdrops. Withdraw to Opay, earn ₦5,000')).toBe(2);
		expect(nigeriaScore('Naija hustle from Lagos')).toBe(2);
		expect(nigeriaScore('Global crypto signals')).toBe(0);
	});

	it('picks up channels a channel promotes, but not itself, bots or invite links', () => {
		expect(
			mentionedUsernames(
				[
					'Join @AirdropHub and t.me/naija_earn',
					'Me: @self_channel, bot: @tip_bot, t.me/joinchat/abc'
				],
				'self_channel'
			)
		).toEqual(['airdrophub', 'naija_earn']);
	});
});
