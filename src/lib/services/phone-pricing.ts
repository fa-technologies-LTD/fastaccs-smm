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
	ceilingTolerancePercent: 'config.phone.ceiling_tolerance_percent',
	lowBalanceThresholdCents: 'config.phone.low_balance_threshold_cents',
	activationTimeoutMinutes: 'config.phone.activation_timeout_minutes'
} as const;

const DEFAULTS = {
	usdNgnRate: Math.max(1, Number(env.HUBMAN_USD_NGN_RATE || 1700)),
	marginPercent: 100, // 2× cost by default; David tunes this in admin
	ceilingTolerancePercent: 20, // allow live cost up to 20% over expected before failing
	lowBalanceThresholdCents: 500, // alert when hub-man balance drops below $5
	activationTimeoutMinutes: 20 // wait this long for the OTP before auto-cancel+refund
} as const;

// No number is sold below this, and prices round to clean ₦100s (fewer payment mistakes).
export const NUMBERS_PRICE_FLOOR_NGN = 1000;

/** Round a NGN amount UP to the nearest ₦100, with a ₦1,000 floor. */
export function roundNgnUp(amount: number, step = 100): number {
	if (!Number.isFinite(amount) || amount <= 0) return NUMBERS_PRICE_FLOOR_NGN;
	return Math.max(NUMBERS_PRICE_FLOOR_NGN, Math.ceil(amount / step) * step);
}

export interface PhonePricingConfig {
	usdNgnRate: number;
	marginPercent: number;
	ceilingTolerancePercent: number;
	lowBalanceThresholdCents: number;
	activationTimeoutMinutes: number;
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
		)
	};
}

export async function savePhonePricingConfig(input: Partial<PhonePricingConfig>): Promise<void> {
	const entries: Array<[string, number, string]> = [];
	if (input.usdNgnRate != null)
		entries.push([PHONE_PRICING_KEYS.usdNgnRate, Math.max(1, input.usdNgnRate), 'USD→NGN rate for Numbers pricing']);
	if (input.marginPercent != null)
		entries.push([PHONE_PRICING_KEYS.marginPercent, Math.max(0, input.marginPercent), 'Profit margin % on Numbers']);
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

/** Realized margin (NGN) on a completed rental, for analytics. */
export function computeRealizedMarginNgn(
	saleNgn: number,
	actualCostCents: number,
	usdNgnRate: number
): number {
	const costNgn = (Math.max(0, actualCostCents) / 100) * usdNgnRate;
	return saleNgn - costNgn;
}
