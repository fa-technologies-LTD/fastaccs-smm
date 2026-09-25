import type { PrismaClient } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';

export const BOOSTING_PRICING_KEYS = {
	usdNgnRate: 'config.boosting.usd_ngn_rate',
	currencyBufferPercent: 'config.boosting.currency_buffer_percent',
	defaultMarginPercent: 'config.boosting.default_margin_percent'
} as const;

export interface BoostingPricingConfig {
	usdNgnRate: number;
	currencyBufferPercent: number;
	defaultMarginPercent: number;
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function defaults(): BoostingPricingConfig {
	return {
		usdNgnRate: finite(env.BOOSTING_USD_NGN_RATE || env.HUBMAN_USD_NGN_RATE, 1700, 1, 1_000_000),
		currencyBufferPercent: finite(env.BOOSTING_CURRENCY_BUFFER_PERCENT, 5, 0, 100),
		defaultMarginPercent: finite(env.BOOSTING_DEFAULT_MARGIN_PERCENT, 40, 1, 95)
	};
}

export async function getBoostingPricingConfig(
	database: PrismaClient = prisma
): Promise<BoostingPricingConfig> {
	const fallback = defaults();
	const rows = await database.microcopy.findMany({
		where: { key: { in: Object.values(BOOSTING_PRICING_KEYS) }, isActive: true },
		select: { key: true, value: true }
	});
	const values = new Map(rows.map((row) => [row.key, row.value]));
	return {
		usdNgnRate: finite(values.get(BOOSTING_PRICING_KEYS.usdNgnRate), fallback.usdNgnRate, 1, 1_000_000),
		currencyBufferPercent: finite(
			values.get(BOOSTING_PRICING_KEYS.currencyBufferPercent),
			fallback.currencyBufferPercent,
			0,
			100
		),
		defaultMarginPercent: finite(
			values.get(BOOSTING_PRICING_KEYS.defaultMarginPercent),
			fallback.defaultMarginPercent,
			1,
			95
		)
	};
}

export async function saveBoostingPricingConfig(
	input: Partial<BoostingPricingConfig>,
	database: PrismaClient = prisma
): Promise<BoostingPricingConfig> {
	const current = await getBoostingPricingConfig(database);
	const next: BoostingPricingConfig = {
		usdNgnRate: finite(input.usdNgnRate, current.usdNgnRate, 1, 1_000_000),
		currencyBufferPercent: finite(
			input.currencyBufferPercent,
			current.currencyBufferPercent,
			0,
			100
		),
		defaultMarginPercent: finite(
			input.defaultMarginPercent,
			current.defaultMarginPercent,
			1,
			95
		)
	};
	const entries: Array<[keyof BoostingPricingConfig, string]> = [
		['usdNgnRate', BOOSTING_PRICING_KEYS.usdNgnRate],
		['currencyBufferPercent', BOOSTING_PRICING_KEYS.currencyBufferPercent],
		['defaultMarginPercent', BOOSTING_PRICING_KEYS.defaultMarginPercent]
	];
	await database.$transaction(
		entries.map(([field, key]) => {
			return database.microcopy.upsert({
				where: { key },
				update: { value: String(next[field]), category: 'settings', isActive: true },
				create: {
					key,
					value: String(next[field]),
					category: 'settings',
					description: `Boosting pricing setting: ${field}`,
					isActive: true
				}
			});
		})
	);
	return next;
}

export function roundBoostingPrice(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 50;
	return Math.max(50, Math.ceil((value - 1e-9) / 50) * 50);
}

export function estimateBoostingSupplierCostNgn(input: {
	ratePerThousandUsd: number;
	quantity: number;
	usdNgnRate: number;
	currencyBufferPercent: number;
}): number {
	const rawUsd = (Math.max(0, input.ratePerThousandUsd) * Math.max(0, input.quantity)) / 1000;
	return rawUsd * Math.max(1, input.usdNgnRate) * (1 + Math.max(0, input.currencyBufferPercent) / 100);
}

export function suggestBoostingCustomerPrice(input: {
	supplierCostNgn: number;
	targetMarginPercent: number;
}): number {
	const margin = Math.min(95, Math.max(1, input.targetMarginPercent));
	return roundBoostingPrice(Math.max(0, input.supplierCostNgn) / (1 - margin / 100));
}

export function maximumBoostingSupplierSpend(
	customerPriceNgn: number,
	minimumMarginPercent: number
): number {
	const margin = Math.min(95, Math.max(0, minimumMarginPercent));
	return Math.max(1, Math.floor(Math.max(0, customerPriceNgn) * (1 - margin / 100)));
}
