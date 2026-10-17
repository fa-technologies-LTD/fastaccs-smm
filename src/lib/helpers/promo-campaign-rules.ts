/**
 * Refer & Win and BIGSPENDER: settings, guard rails and the qualifying rules, as pure functions.
 * Both campaigns pay promo credit (see promo-credit.ts) and are OFF until the owner switches them on.
 */

import { PROMO_DEFAULT_CAP_PERCENT, PROMO_MAX_CAP_WITHOUT_OVERRIDE } from './promo-credit';

export const CAMPAIGN_KEY_PREFIX = 'config.campaign.';
export const REFER_WIN_KEY = `${CAMPAIGN_KEY_PREFIX}refer_win`;
export const BIGSPENDER_KEY = `${CAMPAIGN_KEY_PREFIX}bigspender`;

export type CampaignKind = 'refer_win' | 'bigspender';

/** Campaign settings are owner-only and edited from Admin → Campaigns, never the microcopy editor. */
export function isOwnerOnlyConfigKey(key: unknown): boolean {
	return typeof key === 'string' && key.startsWith(CAMPAIGN_KEY_PREFIX);
}

export interface CampaignCommonSettings {
	enabled: boolean;
	rewardNgn: number;
	expiryDays: number;
	/** Most of an order (after discounts) this campaign's credit may pay. */
	capPercent: number;
	/** Separate switch required before capPercent may go above 50. */
	allowAboveHalf: boolean;
	/** Set when first switched on; nothing before it counts (no backfill). */
	startsAt: string | null;
	endsAt: string | null;
	updatedAt: string | null;
	updatedBy: string | null;
}

export interface ReferWinSettings extends CampaignCommonSettings {
	qualifyingCashNgn: number;
	monthlyLimit: number;
	includeSuper: boolean;
	waitHours: number;
	/** Owner acknowledged the thin-margin warning for exactly these reward/qualifying values. */
	marginWarningAcknowledged: {
		at: string;
		by: string;
		rewardNgn: number;
		qualifyingCashNgn: number;
	} | null;
}

export interface BigSpenderSettings extends CampaignCommonSettings {
	thresholdNgn: number;
	remindersEnabled: boolean;
	reminderDaysBefore: number;
}

const COMMON_DEFAULTS: Omit<CampaignCommonSettings, 'rewardNgn'> = {
	enabled: false,
	expiryDays: 30,
	capPercent: PROMO_DEFAULT_CAP_PERCENT,
	allowAboveHalf: false,
	startsAt: null,
	endsAt: null,
	updatedAt: null,
	updatedBy: null
};

export const REFER_WIN_DEFAULTS: ReferWinSettings = {
	...COMMON_DEFAULTS,
	rewardNgn: 1_000,
	qualifyingCashNgn: 5_000,
	monthlyLimit: 3,
	includeSuper: false,
	waitHours: 24,
	marginWarningAcknowledged: null
};

export const BIGSPENDER_DEFAULTS: BigSpenderSettings = {
	...COMMON_DEFAULTS,
	rewardNgn: 3_000,
	thresholdNgn: 100_000,
	remindersEnabled: false,
	reminderDaysBefore: 7
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function wholeNumber(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function isoOrNull(value: unknown): string | null {
	if (typeof value !== 'string' || !value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(raw: string | null | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		return record(JSON.parse(raw));
	} catch {
		return {};
	}
}

function parseCommon<T extends CampaignCommonSettings>(
	value: Record<string, unknown>,
	defaults: T
): CampaignCommonSettings {
	return {
		enabled: value.enabled === true,
		rewardNgn: wholeNumber(value.rewardNgn, defaults.rewardNgn),
		expiryDays: wholeNumber(value.expiryDays, defaults.expiryDays),
		capPercent: wholeNumber(value.capPercent, defaults.capPercent),
		allowAboveHalf: value.allowAboveHalf === true,
		startsAt: isoOrNull(value.startsAt),
		endsAt: isoOrNull(value.endsAt),
		updatedAt: isoOrNull(value.updatedAt),
		updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : null
	};
}

/** Settings as stored (microcopy JSON). Anything missing or malformed falls back to OFF defaults. */
export function parseReferWinSettings(raw: string | null | undefined): ReferWinSettings {
	const value = parseJson(raw);
	const ack = record(value.marginWarningAcknowledged);
	return {
		...parseCommon(value, REFER_WIN_DEFAULTS),
		qualifyingCashNgn: wholeNumber(value.qualifyingCashNgn, REFER_WIN_DEFAULTS.qualifyingCashNgn),
		monthlyLimit: wholeNumber(value.monthlyLimit, REFER_WIN_DEFAULTS.monthlyLimit),
		includeSuper: value.includeSuper === true,
		waitHours: wholeNumber(value.waitHours, REFER_WIN_DEFAULTS.waitHours),
		marginWarningAcknowledged:
			typeof ack.at === 'string' && typeof ack.by === 'string'
				? {
						at: ack.at,
						by: ack.by,
						rewardNgn: wholeNumber(ack.rewardNgn, 0),
						qualifyingCashNgn: wholeNumber(ack.qualifyingCashNgn, 0)
					}
				: null
	};
}

export function parseBigSpenderSettings(raw: string | null | undefined): BigSpenderSettings {
	const value = parseJson(raw);
	return {
		...parseCommon(value, BIGSPENDER_DEFAULTS),
		thresholdNgn: wholeNumber(value.thresholdNgn, BIGSPENDER_DEFAULTS.thresholdNgn),
		remindersEnabled: value.remindersEnabled === true,
		reminderDaysBefore: wholeNumber(
			value.reminderDaysBefore,
			BIGSPENDER_DEFAULTS.reminderDaysBefore
		)
	};
}

/** Plain-English problems with a proposed settings change (empty = valid). */
export function validateCampaignSettings(
	settings: CampaignCommonSettings & Partial<ReferWinSettings> & Partial<BigSpenderSettings>
): string[] {
	const errors: string[] = [];
	if (settings.rewardNgn < 1 || settings.rewardNgn > 100_000)
		errors.push('The reward must be between ₦1 and ₦100,000.');
	if (settings.expiryDays < 1 || settings.expiryDays > 365)
		errors.push('Credit must expire after 1 to 365 days.');
	if (settings.capPercent < 1 || settings.capPercent > 100)
		errors.push('The checkout cap must be between 1% and 100%.');
	if (settings.capPercent > PROMO_MAX_CAP_WITHOUT_OVERRIDE && !settings.allowAboveHalf)
		errors.push(
			`A cap above ${PROMO_MAX_CAP_WITHOUT_OVERRIDE}% needs the separate “allow above ${PROMO_MAX_CAP_WITHOUT_OVERRIDE}%” switch.`
		);
	if (settings.startsAt && settings.endsAt && settings.endsAt <= settings.startsAt)
		errors.push('The end date must be after the start date.');
	if (settings.qualifyingCashNgn !== undefined && settings.qualifyingCashNgn < 1_000)
		errors.push('The friend’s qualifying spend must be at least ₦1,000.');
	if (
		settings.monthlyLimit !== undefined &&
		(settings.monthlyLimit < 1 || settings.monthlyLimit > 50)
	)
		errors.push('The monthly limit per referrer must be between 1 and 50.');
	if (settings.waitHours !== undefined && (settings.waitHours < 0 || settings.waitHours > 720))
		errors.push('The wait after the qualifying order must be between 0 and 720 hours.');
	if (settings.thresholdNgn !== undefined && settings.thresholdNgn < 1_000)
		errors.push('The spend threshold must be at least ₦1,000.');
	if (
		settings.reminderDaysBefore !== undefined &&
		(settings.reminderDaysBefore < 1 || settings.reminderDaysBefore > settings.expiryDays)
	)
		errors.push('Reminders must go out between 1 day and the full expiry period before expiry.');
	return errors;
}

export function isCampaignLive(settings: CampaignCommonSettings, now: Date = new Date()): boolean {
	if (!settings.enabled || !settings.startsAt) return false;
	if (new Date(settings.startsAt) > now) return false;
	return !settings.endsAt || now < new Date(settings.endsAt);
}

// ---------------------------------------------------------------------------------------------
// Refer & Win margin gate
// ---------------------------------------------------------------------------------------------

export interface TierMargin {
	name: string;
	priceNgn: number;
	unitCostNgn: number | null;
}

export type MarginCheck =
	| { status: 'needs_costs'; missing: string[]; checked: number }
	| {
			status: 'ok' | 'warning';
			thinnestTier: string;
			thinnestMarginPercent: number;
			profitOnQualifyingOrder: number;
			halfProfit: number;
			checked: number;
	  };

/**
 * Is the reward more than half the profit we'd make on the friend's qualifying spend, if they
 * bought our thinnest-margin account tier? (₦1,000 on ₦5,000 crosses this below a 40% margin.)
 * Blocked outright until every active account tier has a cost, as the owner asked.
 */
export function referWinMarginCheck(
	tiers: ReadonlyArray<TierMargin>,
	settings: Pick<ReferWinSettings, 'rewardNgn' | 'qualifyingCashNgn'>
): MarginCheck {
	const priced = tiers.filter((tier) => tier.priceNgn > 0);
	const missing = priced.filter((tier) => tier.unitCostNgn === null).map((tier) => tier.name);
	if (priced.length === 0 || missing.length > 0) {
		return { status: 'needs_costs', missing, checked: priced.length };
	}
	let thinnest = priced[0];
	let thinnestMargin = Infinity;
	for (const tier of priced) {
		const margin = (tier.priceNgn - (tier.unitCostNgn ?? 0)) / tier.priceNgn;
		if (margin < thinnestMargin) {
			thinnestMargin = margin;
			thinnest = tier;
		}
	}
	const profit = Math.max(0, Math.round(settings.qualifyingCashNgn * thinnestMargin));
	const halfProfit = profit / 2;
	return {
		status: settings.rewardNgn > halfProfit ? 'warning' : 'ok',
		thinnestTier: thinnest.name,
		thinnestMarginPercent: Math.round(thinnestMargin * 1000) / 10,
		profitOnQualifyingOrder: profit,
		halfProfit: Math.round(halfProfit),
		checked: priced.length
	};
}

/** May Refer & Win be switched on? Returns the plain-English reason when it may not. */
export function referWinSwitchOnBlock(
	settings: Pick<ReferWinSettings, 'rewardNgn' | 'qualifyingCashNgn' | 'marginWarningAcknowledged'>,
	check: MarginCheck
): string | null {
	if (check.status === 'needs_costs') {
		return check.checked === 0
			? 'Refer & Win stays locked until account tiers have prices and costs.'
			: `Refer & Win stays locked until every active account tier has a cost. Missing: ${check.missing.join(', ')}.`;
	}
	if (check.status === 'warning') {
		const ack = settings.marginWarningAcknowledged;
		const acknowledged =
			ack &&
			ack.rewardNgn === settings.rewardNgn &&
			ack.qualifyingCashNgn === settings.qualifyingCashNgn;
		if (!acknowledged) {
			return `The reward is more than half the profit on a qualifying order at the thinnest margin (${check.thinnestTier}, ${check.thinnestMarginPercent}%). Acknowledge the warning first.`;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------------------------
// Refer & Win qualifying rule
// ---------------------------------------------------------------------------------------------

export interface FriendOrder {
	id: string;
	totalAmount: number;
	storeCreditApplied: number;
	refundedAmount: number;
	paidAt: Date | null;
	deliveredAt: Date | null;
	delivered: boolean;
}

/** Cash the customer paid and kept (store credit of any kind is never cash). */
export function keptCash(
	order: Pick<FriendOrder, 'totalAmount' | 'storeCreditApplied' | 'refundedAmount'>
): number {
	const total = Math.max(0, order.totalAmount);
	if (total <= 0) return 0;
	const cash = Math.max(0, total - Math.max(0, order.storeCreditApplied));
	const keptShare = Math.max(0, total - Math.max(0, order.refundedAmount)) / total;
	return Math.round(cash * keptShare * 100) / 100;
}

export type ReferWinProgress =
	| { status: 'not_yet'; settledCash: number; pendingCash: number }
	| { status: 'waiting'; settledCash: number; pendingCash: number; readyAt: Date }
	| { status: 'ready'; settledCash: number; triggerOrderId: string };

/**
 * A friend qualifies once kept cash (net of refunds) on orders that are COMPLETE and at least
 * `waitHours` past completion reaches the threshold; the order that crosses it is the trigger.
 * Orders still being delivered, or still inside the wait, are "pending" so the dry run can say
 * when the reward would be issued.
 */
export function referWinProgress(
	orders: ReadonlyArray<FriendOrder>,
	settings: Pick<ReferWinSettings, 'qualifyingCashNgn' | 'waitHours'>,
	now: Date = new Date()
): ReferWinProgress {
	const waitMs = settings.waitHours * 3_600_000;
	const paid = orders.filter((order) => order.paidAt);
	const completed = paid
		.filter((order) => order.delivered && order.deliveredAt)
		.map((order) => ({
			order,
			cash: keptCash(order),
			settlesAt: new Date(order.deliveredAt!.getTime() + waitMs)
		}))
		.filter((entry) => entry.cash > 0)
		.sort((a, b) => a.settlesAt.getTime() - b.settlesAt.getTime());

	let settled = 0;
	for (const entry of completed.filter((item) => item.settlesAt <= now)) {
		settled += entry.cash;
		if (settled >= settings.qualifyingCashNgn) {
			return { status: 'ready', settledCash: round2(settled), triggerOrderId: entry.order.id };
		}
	}
	const inWait = completed.filter((item) => item.settlesAt > now);
	const undeliveredCash = paid
		.filter((order) => !(order.delivered && order.deliveredAt))
		.reduce((sum, order) => sum + keptCash(order), 0);
	const pendingCash = round2(inWait.reduce((sum, item) => sum + item.cash, 0) + undeliveredCash);
	let running = settled;
	for (const entry of inWait) {
		running += entry.cash;
		if (running >= settings.qualifyingCashNgn) {
			return {
				status: 'waiting',
				settledCash: round2(settled),
				pendingCash,
				readyAt: entry.settlesAt
			};
		}
	}
	return { status: 'not_yet', settledCash: round2(settled), pendingCash };
}

/** Kept cash on all paid orders (used after issue to decide whether a refund undoes the reward). */
export function totalKeptCash(orders: ReadonlyArray<FriendOrder>): number {
	return round2(
		orders.filter((order) => order.paidAt).reduce((sum, order) => sum + keptCash(order), 0)
	);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** First instant of the WAT calendar month containing `at`. */
export function lagosMonthStart(at: Date): Date {
	const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
	return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
}

export function nextLagosMonthStart(at: Date): Date {
	const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
	return new Date(
		Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - LAGOS_OFFSET_MS
	);
}
