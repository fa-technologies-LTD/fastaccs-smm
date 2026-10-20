import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { parseTierUnitCost } from '$lib/helpers/tier-unit-cost';

export { TIER_UNIT_COST_KEY, parseTierUnitCost } from '$lib/helpers/tier-unit-cost';

/**
 * Super affiliate terms that start at a configurable switchover (blank = not set, so today's
 * terms, including the monthly bonus, stay in force). From the switchover: ₦700 per activation,
 * activation on kept cash paid on account orders, then 5% of profit on later account orders.
 */

export const SUPER_SWITCHOVER_KEY = 'config.affiliate.super.switchover_at';
export const SUPER_ORDER_COMMISSION_PERCENT = 5;
export { SUPER_COMMISSION_REFERENCE_PREFIX } from '$lib/helpers/super-earnings-grouping';
export const SUPER_ORDER_COMMISSION_KIND = 'super_order_commission';
export const SUPER_COST_MISSING_HOLD = 'cost_missing';

/** End of the window in which activations still count towards a monthly bonus. */
export function superBonusWindowEnd(monthEnd: Date, switchoverAt: Date | null): Date {
	return switchoverAt && switchoverAt < monthEnd ? switchoverAt : monthEnd;
}

type Database = PrismaClient | Prisma.TransactionClient;

export function parseSwitchoverAt(value: unknown): Date | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const at = new Date(value.trim());
	return Number.isNaN(at.getTime()) ? null : at;
}

export async function getSuperSwitchoverAt(db: Database = prisma): Promise<Date | null> {
	const row = await db.microcopy.findUnique({
		where: { key: SUPER_SWITCHOVER_KEY },
		select: { value: true, isActive: true }
	});
	return row?.isActive ? parseSwitchoverAt(row.value) : null;
}

export interface GoodsCostSnapshotItem {
	orderItemId: string;
	categoryId: string;
	quantity: number;
	unitCostNgn: number | null;
	/** Paid add-ons (e.g. Verified X followers) have no entered cost, so the order is held. */
	hasAddon: boolean;
}

export interface GoodsCostSnapshot {
	version: 1;
	items: GoodsCostSnapshotItem[];
}

/** Saved on the order at checkout, so editing a tier's cost later never rewrites history. */
export function buildGoodsCostSnapshot(
	items: ReadonlyArray<{
		orderItemId: string;
		categoryId: string;
		quantity: number;
		categoryMetadata: unknown;
		hasAddon?: boolean;
	}>
): GoodsCostSnapshot {
	return {
		version: 1,
		items: items.map((item) => ({
			orderItemId: item.orderItemId,
			categoryId: item.categoryId,
			quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
			unitCostNgn: parseTierUnitCost(item.categoryMetadata),
			hasAddon: Boolean(item.hasAddon)
		}))
	};
}

/** Total goods cost for the order, or null when any line has no cost (hold, never estimate). */
export function goodsCostFromOrderMetadata(analyticsMetadata: unknown): number | null {
	if (!analyticsMetadata || typeof analyticsMetadata !== 'object') return null;
	const snapshot = (analyticsMetadata as Record<string, unknown>).goodsCost as
		| GoodsCostSnapshot
		| undefined;
	if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.items)) return null;
	if (snapshot.items.length === 0) return null;
	let total = 0;
	for (const item of snapshot.items) {
		if (item.hasAddon || item.unitCostNgn === null || !Number.isFinite(item.unitCostNgn)) {
			return null;
		}
		total += item.unitCostNgn * Math.max(0, Number(item.quantity) || 0);
	}
	return Math.round(total * 100) / 100;
}

/** A Super affiliate once the switchover has passed (new terms: payouts within 1–3 days). */
export async function isSuperAffiliateOnNewTerms(
	userId: string | null | undefined,
	now: Date = new Date()
): Promise<boolean> {
	if (!userId) return false;
	try {
		const [program, switchoverAt] = await Promise.all([
			prisma.affiliateProgram.findUnique({
				where: { userId },
				select: { isSuperAffiliate: true }
			}),
			getSuperSwitchoverAt()
		]);
		return Boolean(program?.isSuperAffiliate && switchoverAt && now >= switchoverAt);
	} catch {
		return false;
	}
}

/** The payout-timing sentence affiliates see in emails. */
export function payoutTimingSentence(superOnNewTerms: boolean): string {
	return superOnNewTerms
		? 'Payouts are processed within 1–3 days.'
		: 'Payouts are processed on Saturdays.';
}
