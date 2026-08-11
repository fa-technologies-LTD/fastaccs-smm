import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';

/**
 * Pricing for the automated Numbers service.
 *
 * hub-man costs are dynamic USD cents. David picks a margin; we convert the expected
 * cost to a fixed NGN price the customer sees up front. A per-rent `max_price_cents`
 * ceiling (expected cost + tolerance) is sent to hub-man so a live price spike can
 * never silently eat the margin — if the live cost exceeds it, the rent fails cleanly
 * and the customer is refunded rather than sold a loss.
 *
 * Config is stored in the shared key-value settings table (`microcopy`, category
 * `settings`), the same store the admin-settings service uses.
 */

const SETTINGS_CATEGORY = 'settings';

const PHONE_PRICING_KEYS = {
	usdNgnRate: 'config.phone.usd_ngn_rate',
	marginPercent: 'config.phone.margin_percent',
	minProfitNgn: 'config.phone.min_profit_ngn',
	ceilingTolerancePercent: 'config.phone.ceiling_tolerance_percent',
	lowBalanceThresholdCents: 'config.phone.low_balance_threshold_cents',
	activationTimeoutMinutes: 'config.phone.activation_timeout_minutes',
	maxPriceMultiple: 'config.phone.max_price_multiple',
	minFulfillmentProfitNgn: 'config.phone.min_fulfillment_profit_ngn',
	otpReplacementWaitSeconds: 'config.phone.otp_replacement_wait_seconds'
} as const;

const DEFAULTS = {
	usdNgnRate: Math.max(1, Number(env.HUBMAN_USD_NGN_RATE || 1700)),
	marginPercent: 100, // 2× cost by default; David tunes this in admin
	minProfitNgn: 1000, // floor profit per number; David can raise/lower it in admin
	ceilingTolerancePercent: 20, // allow live cost up to 20% over expected before failing
	lowBalanceThresholdCents: 500, // alert when hub-man balance drops below $5
	activationTimeoutMinutes: 20, // wait this long for the OTP before auto-cancel+refund
	maxPriceMultiple: 2.5, // competitive price cap: sticker ≤ 2.5× basis cost (floor still wins)
	minFulfillmentProfitNgn: 500, // HARD floor: never intentionally procure a number that leaves < this profit
	otpReplacementWaitSeconds: 120 // wait this long after "I've requested the code" before allowing a replacement
} as const;

// No number is sold below this, and prices round to clean ₦100s (fewer payment mistakes).
export const NUMBERS_PRICE_FLOOR_NGN = 1000;

/** Default competitive price cap: the sticker never exceeds this multiple of the basis cost. */
export const NUMBERS_MAX_PRICE_MULTIPLE = 2.5;

/**
 * The HARD minimum profit on every successful fulfilment (the owner's absolute floor). Distinct
 * from the pricing profit floor (NUMBERS_MIN_PROFIT_NGN ₦1,000, which the *sticker* aims for):
 * once an order is paid, we may compress margin to deliver, but we NEVER intentionally rent a
 * number that would leave less than this profit. No intentional-loss / rescue spending exists.
 */
export const NUMBERS_MIN_FULFILLMENT_PROFIT_NGN = 500;

/**
 * The learning epoch. Only rentals RECEIVED on/after this instant may train pricing (realized
 * cost) or reliability. Everything before it was produced under the three now-fixed bugs
 * (hub-man delivered-SMS-in-array parse, pvapins hyphenated-OTP parse, hub-man-only availability
 * guard) and would poison the learning with false failures / missing successes. Accounting and
 * audit history are untouched — this cutoff only gates the adaptive signals.
 */
export const NUMBERS_CLEAN_EPOCH = new Date('2026-08-10T00:00:00Z');

/** Round a NGN amount UP to the nearest ₦100, with a ₦1,000 floor. */
export function roundNgnUp(amount: number, step = 100): number {
	if (!Number.isFinite(amount) || amount <= 0) return NUMBERS_PRICE_FLOOR_NGN;
	return Math.max(NUMBERS_PRICE_FLOOR_NGN, Math.ceil(amount / step) * step);
}

export interface PhonePricingConfig {
	usdNgnRate: number;
	marginPercent: number;
	minProfitNgn: number;
	ceilingTolerancePercent: number;
	lowBalanceThresholdCents: number;
	activationTimeoutMinutes: number;
	maxPriceMultiple: number;
	minFulfillmentProfitNgn: number;
	otpReplacementWaitSeconds: number;
}

function parseNumber(value: string | undefined, fallback: number, min = 0): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, parsed);
}

export async function getPhonePricingConfig(): Promise<PhonePricingConfig> {
	const rows = await prisma.microcopy.findMany({
		where: { key: { in: Object.values(PHONE_PRICING_KEYS) } },
		select: { key: true, value: true }
	});
	const map = new Map(rows.map((r) => [r.key, r.value]));

	return {
		usdNgnRate: parseNumber(map.get(PHONE_PRICING_KEYS.usdNgnRate), DEFAULTS.usdNgnRate, 1),
		marginPercent: parseNumber(map.get(PHONE_PRICING_KEYS.marginPercent), DEFAULTS.marginPercent, 0),
		minProfitNgn: parseNumber(map.get(PHONE_PRICING_KEYS.minProfitNgn), DEFAULTS.minProfitNgn, 0),
		ceilingTolerancePercent: parseNumber(
			map.get(PHONE_PRICING_KEYS.ceilingTolerancePercent),
			DEFAULTS.ceilingTolerancePercent,
			0
		),
		lowBalanceThresholdCents: parseNumber(
			map.get(PHONE_PRICING_KEYS.lowBalanceThresholdCents),
			DEFAULTS.lowBalanceThresholdCents,
			0
		),
		activationTimeoutMinutes: parseNumber(
			map.get(PHONE_PRICING_KEYS.activationTimeoutMinutes),
			DEFAULTS.activationTimeoutMinutes,
			1
		),
		maxPriceMultiple: parseNumber(map.get(PHONE_PRICING_KEYS.maxPriceMultiple), DEFAULTS.maxPriceMultiple, 1),
		minFulfillmentProfitNgn: parseNumber(
			map.get(PHONE_PRICING_KEYS.minFulfillmentProfitNgn),
			DEFAULTS.minFulfillmentProfitNgn,
			0
		),
		otpReplacementWaitSeconds: parseNumber(
			map.get(PHONE_PRICING_KEYS.otpReplacementWaitSeconds),
			DEFAULTS.otpReplacementWaitSeconds,
			30
		)
	};
}

export async function savePhonePricingConfig(input: Partial<PhonePricingConfig>): Promise<void> {
	const entries: Array<[string, number, string]> = [];
	if (input.usdNgnRate != null)
		entries.push([PHONE_PRICING_KEYS.usdNgnRate, Math.max(1, input.usdNgnRate), 'USD→NGN rate for Numbers pricing']);
	if (input.marginPercent != null)
		entries.push([PHONE_PRICING_KEYS.marginPercent, Math.max(0, input.marginPercent), 'Profit margin % on Numbers']);
	if (input.minProfitNgn != null)
		entries.push([PHONE_PRICING_KEYS.minProfitNgn, Math.max(0, Math.round(input.minProfitNgn)), 'Minimum profit floor per number (NGN)']);
	if (input.ceilingTolerancePercent != null)
		entries.push([
			PHONE_PRICING_KEYS.ceilingTolerancePercent,
			Math.max(0, input.ceilingTolerancePercent),
			'Max price ceiling tolerance % over expected cost'
		]);
	if (input.lowBalanceThresholdCents != null)
		entries.push([
			PHONE_PRICING_KEYS.lowBalanceThresholdCents,
			Math.max(0, Math.round(input.lowBalanceThresholdCents)),
			'hub-man low-balance alert threshold (USD cents)'
		]);
	if (input.activationTimeoutMinutes != null)
		entries.push([
			PHONE_PRICING_KEYS.activationTimeoutMinutes,
			Math.max(1, Math.round(input.activationTimeoutMinutes)),
			'Minutes to wait for OTP before auto-cancel+refund'
		]);
	if (input.maxPriceMultiple != null)
		entries.push([
			PHONE_PRICING_KEYS.maxPriceMultiple,
			Math.max(1, input.maxPriceMultiple),
			'Competitive price cap — sticker ≤ this × basis cost (floor still wins)'
		]);
	if (input.minFulfillmentProfitNgn != null)
		entries.push([
			PHONE_PRICING_KEYS.minFulfillmentProfitNgn,
			Math.max(0, Math.round(input.minFulfillmentProfitNgn)),
			'Hard minimum profit per successful number — never intentionally procure below it (NGN)'
		]);
	if (input.otpReplacementWaitSeconds != null)
		entries.push([
			PHONE_PRICING_KEYS.otpReplacementWaitSeconds,
			Math.max(30, Math.round(input.otpReplacementWaitSeconds)),
			'Seconds to wait after "I\'ve requested the code" before allowing a replacement number'
		]);

	for (const [key, value, description] of entries) {
		await prisma.microcopy.upsert({
			where: { key },
			update: { value: String(value), description, category: SETTINGS_CATEGORY, isActive: true },
			create: { key, value: String(value), description, category: SETTINGS_CATEGORY, isActive: true }
		});
	}
}

/**
 * The fixed NGN price the customer pays, given the expected hub-man cost (USD cents).
 * = expectedCostUsd × rate × (1 + margin), rounded up to a clean NGN figure.
 */
export function computeSaleNgn(
	expectedCostCents: number,
	config: Pick<PhonePricingConfig, 'usdNgnRate' | 'marginPercent'>
): number {
	const costUsd = Math.max(0, expectedCostCents) / 100;
	const raw = costUsd * config.usdNgnRate * (1 + config.marginPercent / 100);
	return roundNgnUp(raw);
}

/**
 * The `max_price_cents` ceiling to send to hub-man for this tier.
 * = expected cost + tolerance. Live cost above this → rent fails → customer refunded.
 */
export function computeMaxPriceCents(
	expectedCostCents: number,
	tolerancePercent: number
): number {
	return Math.ceil(Math.max(1, expectedCostCents) * (1 + tolerancePercent / 100));
}

/** Minimum naira profit we guarantee on every number rental (the floor, never the target). */
export const NUMBERS_MIN_PROFIT_NGN = 1000;

/**
 * Fully-automatic price for a tier — recomputed on every catalog refresh (never sticky,
 * never manual), from a **margin collar** on a competitive cost basis:
 *
 *   price = clamp( cost × (1+margin) , floor , cap )   with the FLOOR always winning
 *   floor = roundUp(cost + minProfit)   — never sell below the guaranteed profit
 *   cap   = roundUp(cost × maxMultiple) — stay competitive; don't balloon a mid-cost tier
 *
 * `basisCostCents` is the *typical* fulfilment cost (a low percentile of the listed variants,
 * blended toward what we actually realize), NOT the worst-case tail — so the sticker tracks
 * what we really pay, not a $5 variant we almost never rent. On very cheap tiers the cap can
 * fall below the floor; the floor wins there, so we always clear min profit. The wider
 * procurement ceiling (see computeProcurementCeilingCents) is what bounds fulfilment spend — this
 * price is only about competitiveness, decoupled from how much we'll spend to fulfil.
 */
export function computeAutoPrice(
	basisCostCents: number,
	config: Pick<PhonePricingConfig, 'usdNgnRate' | 'marginPercent' | 'minProfitNgn' | 'maxPriceMultiple'>
): number {
	const minProfit = config.minProfitNgn ?? NUMBERS_MIN_PROFIT_NGN;
	const multiple = config.maxPriceMultiple ?? NUMBERS_MAX_PRICE_MULTIPLE;
	const costNgn = (Math.max(0, basisCostCents) / 100) * config.usdNgnRate;
	const floorPrice = roundNgnUp(costNgn + minProfit); // ≥ cost + min profit, on a ₦100 grid
	const capPrice = roundNgnUp(costNgn * Math.max(1, multiple)); // competitive ceiling
	const marginPrice = computeSaleNgn(basisCostCents, config); // cost × (1+margin)
	// Clamp margin price into [floor, cap]; if cap < floor (very cheap tier), floor wins.
	return Math.min(Math.max(marginPrice, floorPrice), Math.max(floorPrice, capPrice));
}

/**
 * The HARD procurement ceiling (USD cents) for an already-paid order: the most we will ever spend
 * on suppliers for it while preserving the minimum fulfilment profit. There is NO intentional loss
 * and NO rescue budget — this is `sale − minFulfillmentProfit`, converted to cents.
 *
 *   procurementBudgetNgn = saleNgn − minFulfillmentProfitNgn
 *
 * Returns **0** when the budget is zero or negative (the order cannot be fulfilled at a safe
 * margin at this price → refund, never a loss-making rent). Callers must treat 0 as "nothing
 * affordable" (no candidate has cost ≤ 0). For a multi-attempt order, subtract already-committed
 * and unresolved supplier liability from this budget before evaluating the next candidate.
 */
export function computeProcurementCeilingCents(
	saleNgn: number,
	minFulfillmentProfitNgn: number,
	usdNgnRate: number
): number {
	const budgetNgn = Math.max(0, saleNgn) - Math.max(0, minFulfillmentProfitNgn);
	if (budgetNgn <= 0) return 0;
	return Math.floor((budgetNgn / Math.max(1, usdNgnRate)) * 100);
}

/**
 * The `max_price_cents` we'll pay hub-man for THIS sale and still keep the ₦1,000 profit
 * floor — i.e. pay up to (sale price − ₦1,000), converted to USD cents. Because sticky
 * pricing guarantees price ≥ worst-case cost + ₦1,000, this ceiling always covers what's
 * actually in stock, so rentals reliably succeed instead of refund-looping.
 */
export function computeMaxPriceCentsForSale(
	saleNgn: number,
	config: Pick<PhonePricingConfig, 'usdNgnRate' | 'minProfitNgn'>
): number {
	const minProfit = config.minProfitNgn ?? NUMBERS_MIN_PROFIT_NGN;
	const usableNgn = Math.max(0, saleNgn - minProfit);
	return Math.max(1, Math.floor((usableNgn / Math.max(1, config.usdNgnRate)) * 100));
}

/** Realized margin (NGN) on a completed rental, for analytics. */
export function computeRealizedMarginNgn(
	saleNgn: number,
	actualCostCents: number,
	usdNgnRate: number
): number {
	const costNgn = (Math.max(0, actualCostCents) / 100) * usdNgnRate;
	return saleNgn - costNgn;
}
