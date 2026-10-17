import { describe, expect, it } from 'vitest';
import {
	BIGSPENDER_DEFAULTS,
	REFER_WIN_DEFAULTS,
	isCampaignLive,
	isOwnerOnlyConfigKey,
	keptCash,
	lagosMonthStart,
	nextLagosMonthStart,
	parseBigSpenderSettings,
	parseReferWinSettings,
	referWinMarginCheck,
	referWinProgress,
	referWinSwitchOnBlock,
	validateCampaignSettings,
	type FriendOrder
} from './promo-campaign-rules';

const now = new Date('2026-11-10T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const order = (overrides: Partial<FriendOrder> = {}): FriendOrder => ({
	id: 'o1',
	totalAmount: 5_000,
	storeCreditApplied: 0,
	refundedAmount: 0,
	paidAt: hoursAgo(50),
	delivered: true,
	deliveredAt: hoursAgo(48),
	...overrides
});

describe('campaign settings', () => {
	it('defaults to OFF with the agreed numbers', () => {
		expect(parseReferWinSettings(null)).toMatchObject({
			enabled: false,
			rewardNgn: 1_000,
			qualifyingCashNgn: 5_000,
			monthlyLimit: 3,
			includeSuper: false,
			expiryDays: 30,
			capPercent: 50,
			allowAboveHalf: false,
			startsAt: null
		});
		expect(parseBigSpenderSettings('not json')).toMatchObject({
			enabled: false,
			rewardNgn: 3_000,
			thresholdNgn: 100_000,
			expiryDays: 30,
			capPercent: 50,
			remindersEnabled: false
		});
	});

	it('needs the separate switch for a cap above 50%', () => {
		expect(validateCampaignSettings({ ...REFER_WIN_DEFAULTS, capPercent: 60 })).toEqual([
			expect.stringContaining('above 50%')
		]);
		expect(
			validateCampaignSettings({ ...REFER_WIN_DEFAULTS, capPercent: 60, allowAboveHalf: true })
		).toEqual([]);
		expect(validateCampaignSettings(BIGSPENDER_DEFAULTS)).toEqual([]);
	});

	it('is live only when on, started and not ended', () => {
		const started = { ...REFER_WIN_DEFAULTS, enabled: true, startsAt: hoursAgo(1).toISOString() };
		expect(isCampaignLive(REFER_WIN_DEFAULTS, now)).toBe(false);
		expect(isCampaignLive(started, now)).toBe(true);
		expect(isCampaignLive({ ...started, endsAt: hoursAgo(0.5).toISOString() }, now)).toBe(false);
		expect(isCampaignLive({ ...started, enabled: false }, now)).toBe(false);
	});

	it('keeps campaign settings out of the general microcopy editor', () => {
		expect(isOwnerOnlyConfigKey('config.campaign.refer_win')).toBe(true);
		expect(isOwnerOnlyConfigKey('config.store.announcement_banner')).toBe(false);
	});
});

describe('Refer & Win margin gate', () => {
	const settings = { rewardNgn: 1_000, qualifyingCashNgn: 5_000 };

	it('stays locked until every active account tier has a cost', () => {
		const check = referWinMarginCheck(
			[
				{ name: 'IG · Aged', priceNgn: 4_000, unitCostNgn: 1_000 },
				{ name: 'X · Fresh', priceNgn: 2_000, unitCostNgn: null }
			],
			settings
		);
		expect(check).toEqual({ status: 'needs_costs', missing: ['X · Fresh'], checked: 2 });
		expect(referWinSwitchOnBlock({ ...settings, marginWarningAcknowledged: null }, check)).toMatch(
			/X · Fresh/
		);
	});

	it('warns below a 40% margin (₦1,000 is more than half the profit on ₦5,000)', () => {
		const thin = referWinMarginCheck(
			[
				{ name: 'IG · Aged', priceNgn: 4_000, unitCostNgn: 1_000 },
				{ name: 'X · Fresh', priceNgn: 2_000, unitCostNgn: 1_300 } // 35%
			],
			settings
		);
		expect(thin).toMatchObject({
			status: 'warning',
			thinnestTier: 'X · Fresh',
			thinnestMarginPercent: 35,
			profitOnQualifyingOrder: 1_750
		});
		const fine = referWinMarginCheck(
			[{ name: 'IG', priceNgn: 2_000, unitCostNgn: 1_100 }],
			settings
		); // 45%
		expect(fine.status).toBe('ok');
	});

	it('blocks switch-on until the owner acknowledges the exact reward and threshold', () => {
		const check = referWinMarginCheck(
			[{ name: 'X', priceNgn: 2_000, unitCostNgn: 1_300 }],
			settings
		);
		const ack = { at: now.toISOString(), by: 'owner', rewardNgn: 1_000, qualifyingCashNgn: 5_000 };
		expect(referWinSwitchOnBlock({ ...settings, marginWarningAcknowledged: null }, check)).toMatch(
			/Acknowledge/
		);
		expect(
			referWinSwitchOnBlock({ ...settings, marginWarningAcknowledged: ack }, check)
		).toBeNull();
		// Raising the reward later needs a fresh acknowledgement.
		expect(
			referWinSwitchOnBlock(
				{ ...settings, rewardNgn: 1_500, marginWarningAcknowledged: ack },
				check
			)
		).toMatch(/Acknowledge/);
	});
});

describe('Refer & Win qualifying spend', () => {
	const settings = { qualifyingCashNgn: 5_000, waitHours: 24 };

	it('counts only cash: store credit of any kind is never cash, and refunds are netted', () => {
		expect(keptCash({ totalAmount: 5_000, storeCreditApplied: 2_500, refundedAmount: 0 })).toBe(
			2_500
		);
		expect(keptCash({ totalAmount: 5_000, storeCreditApplied: 0, refundedAmount: 1_000 })).toBe(
			4_000
		);
	});

	it('qualifies once a completed order is 24h old with ₦5,000 kept cash', () => {
		expect(referWinProgress([order()], settings, now)).toEqual({
			status: 'ready',
			settledCash: 5_000,
			triggerOrderId: 'o1'
		});
	});

	it('waits for the 24 hours after completion and says when', () => {
		const result = referWinProgress([order({ deliveredAt: hoursAgo(2) })], settings, now);
		expect(result).toMatchObject({ status: 'waiting', settledCash: 0, pendingCash: 5_000 });
		expect((result as { readyAt: Date }).readyAt).toEqual(
			new Date(hoursAgo(2).getTime() + 86_400_000)
		);
	});

	it('does not count an order that is not complete yet', () => {
		expect(
			referWinProgress([order({ delivered: false, deliveredAt: null })], settings, now)
		).toMatchObject({ status: 'not_yet', settledCash: 0, pendingCash: 5_000 });
	});

	it('does not qualify when part of the spend was paid with credit', () => {
		expect(referWinProgress([order({ storeCreditApplied: 2_500 })], settings, now)).toMatchObject({
			status: 'not_yet',
			settledCash: 2_500
		});
	});

	it('adds up several orders across all services and names the crossing order', () => {
		const result = referWinProgress(
			[
				order({ id: 'a', totalAmount: 3_000, deliveredAt: hoursAgo(80) }),
				order({ id: 'b', totalAmount: 2_500, deliveredAt: hoursAgo(30) })
			],
			settings,
			now
		);
		expect(result).toEqual({ status: 'ready', settledCash: 5_500, triggerOrderId: 'b' });
	});
});

describe('WAT calendar months', () => {
	it('starts the month at midnight Lagos time', () => {
		expect(lagosMonthStart(new Date('2026-10-31T23:30:00.000Z')).toISOString()).toBe(
			'2026-10-31T23:00:00.000Z'
		);
		expect(nextLagosMonthStart(new Date('2026-11-10T12:00:00.000Z')).toISOString()).toBe(
			'2026-11-30T23:00:00.000Z'
		);
	});
});
