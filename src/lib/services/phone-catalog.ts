import { prisma } from '$lib/prisma';
import { Prisma } from '@prisma/client';
import * as hubman from './hubman';
import { getPhonePricingConfig, computeSaleNgn } from './phone-pricing';
import { PHONE_TIER_KEYS, PHONE_DELIVERY_MODE, getPhoneTierConfig } from '$lib/helpers/phone-tier-config';

/**
 * Catalog management for the automated Numbers service.
 *
 * A Numbers tier is a Category with categoryType 'numbers_tier' under the single
 * 'numbers_platform' parent, carrying a hub-man service+country mapping in metadata
 * plus a manually-set NGN price (metadata.pricing.base_price). David prices each tier
 * himself in the admin table; the margin config only produces a *suggested* price.
 */

export const NUMBERS_PLATFORM_SLUG = 'numbers';
// The parent uses a distinct type so it never appears on the account /platforms page.
export const NUMBERS_PLATFORM_TYPE = 'numbers_platform';
// Tiers use the normal 'tier' type so they reuse the entire cart/checkout/hydration
// flow; they're distinguished from account tiers by their parent (the Numbers platform).
export const NUMBERS_TIER_TYPE = 'tier';

// Major services to stock first (verified hub-man IDs).
export const MAJOR_SERVICES = [
	{ id: 1, name: 'WhatsApp' },
	{ id: 2, name: 'Telegram' },
	{ id: 3, name: 'Google / Gmail' },
	{ id: 7, name: 'Instagram' },
	{ id: 11, name: 'Facebook' }
] as const;

// Curated countries (USA, UK, Canada + 3 major EU/Asian), verified available.
export const SEED_COUNTRIES = [
	{ id: 180, name: 'USA', code: 'US' },
	{ id: 41, name: 'United Kingdom', code: 'GB' },
	{ id: 89, name: 'Canada', code: 'CA' },
	{ id: 153, name: 'Poland', code: 'PL' },
	{ id: 75, name: 'Indonesia', code: 'ID' },
	{ id: 116, name: 'Malaysia', code: 'MY' }
] as const;

function tierSlug(serviceId: number, countryId: number): string {
	return `numbers-svc${serviceId}-country${countryId}`;
}

/** The Numbers platform id, or null if not seeded yet. */
export async function getNumbersPlatformId(): Promise<string | null> {
	const platform = await prisma.category.findFirst({
		where: { categoryType: NUMBERS_PLATFORM_TYPE, slug: NUMBERS_PLATFORM_SLUG },
		select: { id: true }
	});
	return platform?.id ?? null;
}

export async function ensureNumbersPlatform(): Promise<string> {
	const existing = await prisma.category.findFirst({
		where: { categoryType: NUMBERS_PLATFORM_TYPE, slug: NUMBERS_PLATFORM_SLUG },
		select: { id: true }
	});
	if (existing) return existing.id;

	const created = await prisma.category.create({
		data: {
			name: 'Numbers',
			slug: NUMBERS_PLATFORM_SLUG,
			categoryType: NUMBERS_PLATFORM_TYPE,
			description: 'Instant verification numbers — receive an OTP in seconds.',
			isActive: true,
			sortOrder: 0,
			metadata: { icon: '📱', color: '#0EA5E9' }
		},
		select: { id: true }
	});
	return created.id;
}

/** Live min-cost (USD cents) per service for a country, from hub-man. */
async function fetchCountryServiceCosts(countryId: number): Promise<Map<number, number>> {
	const out = new Map<number, number>();
	try {
		const data = await hubman.getAvailableServices(countryId);
		const byService = data[String(countryId)] || {};
		for (const [sid, info] of Object.entries(byService)) {
			out.set(Number(sid), info.min_price_cents);
		}
	} catch (error) {
		console.error(`[phone-catalog] failed to fetch costs for country ${countryId}:`, (error as Error).message);
	}
	return out;
}

/**
 * Seed/refresh the curated Numbers tiers. Idempotent — creates missing tiers
 * (inactive, price 0) and refreshes the stored expected cost from live hub-man data.
 * Never overwrites David's set price or active flag.
 */
export async function seedNumbersCatalog(): Promise<{ created: number; refreshed: number }> {
	const platformId = await ensureNumbersPlatform();
	let created = 0;
	let refreshed = 0;

	for (const country of SEED_COUNTRIES) {
		const costs = await fetchCountryServiceCosts(country.id);
		for (const service of MAJOR_SERVICES) {
			const cost = costs.get(service.id);
			if (cost == null) continue; // service not available in this country right now

			const slug = tierSlug(service.id, country.id);
			const existing = await prisma.category.findFirst({
				where: { parentId: platformId, slug },
				select: { id: true, metadata: true }
			});

			if (existing) {
				const md = (existing.metadata as Record<string, unknown>) || {};
				md[PHONE_TIER_KEYS.expectedCostCents] = cost;
				await prisma.category.update({
					where: { id: existing.id },
					data: { metadata: md as Prisma.InputJsonValue }
				});
				refreshed += 1;
			} else {
				await prisma.category.create({
					data: {
						name: `${service.name} — ${country.name}`,
						slug,
						categoryType: NUMBERS_TIER_TYPE,
						parentId: platformId,
						isActive: false, // David prices it before it goes live
						sortOrder: service.id * 1000 + country.id,
						metadata: {
							[PHONE_TIER_KEYS.deliveryMode]: PHONE_DELIVERY_MODE,
							[PHONE_TIER_KEYS.serviceId]: service.id,
							[PHONE_TIER_KEYS.serviceName]: service.name,
							[PHONE_TIER_KEYS.countryId]: country.id,
							[PHONE_TIER_KEYS.countryName]: country.name,
							[PHONE_TIER_KEYS.expectedCostCents]: cost,
							pricing: { currency: 'NGN', base_price: 0 }
						}
					}
				});
				created += 1;
			}
		}
	}

	return { created, refreshed };
}

function readBasePrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object') return 0;
	const pricing = (metadata as Record<string, unknown>).pricing;
	if (!pricing || typeof pricing !== 'object') return 0;
	const raw = Number((pricing as Record<string, unknown>).base_price);
	return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export interface NumbersAdminRow {
	tierId: string;
	serviceId: number;
	serviceName: string;
	countryId: number;
	countryName: string;
	expectedCostCents: number;
	liveCostCents: number | null;
	suggestedNgn: number;
	priceNgn: number;
	active: boolean;
}

/**
 * Rows for the admin pricing table: each tier with its stored cost, a freshly
 * fetched live cost, a suggested NGN price, David's current price, and active flag.
 */
export async function getNumbersCatalogForAdmin(): Promise<{
	rows: NumbersAdminRow[];
	usdNgnRate: number;
	marginPercent: number;
}> {
	const pricing = await getPhonePricingConfig();
	const platformId = await getNumbersPlatformId();
	if (!platformId) return { rows: [], usdNgnRate: pricing.usdNgnRate, marginPercent: pricing.marginPercent };
	const tiers = await prisma.category.findMany({
		where: { parentId: platformId },
		select: { id: true, isActive: true, metadata: true },
		orderBy: { sortOrder: 'asc' }
	});

	// Refresh live costs once per country.
	const countryIds = [...new Set(tiers.map((t) => getPhoneTierConfig(t.metadata)?.countryId).filter((x): x is number => x != null))];
	const liveCosts = new Map<number, Map<number, number>>();
	await Promise.all(
		countryIds.map(async (cid) => liveCosts.set(cid, await fetchCountryServiceCosts(cid)))
	);

	const rows: NumbersAdminRow[] = [];
	for (const tier of tiers) {
		const cfg = getPhoneTierConfig(tier.metadata);
		if (!cfg) continue;
		const liveCost = liveCosts.get(cfg.countryId)?.get(cfg.serviceId) ?? null;
		const costForSuggestion = liveCost ?? cfg.expectedCostCents;
		rows.push({
			tierId: tier.id,
			serviceId: cfg.serviceId,
			serviceName: cfg.serviceName,
			countryId: cfg.countryId,
			countryName: cfg.countryName,
			expectedCostCents: cfg.expectedCostCents,
			liveCostCents: liveCost,
			suggestedNgn: costForSuggestion ? computeSaleNgn(costForSuggestion, pricing) : 0,
			priceNgn: readBasePrice(tier.metadata),
			active: tier.isActive
		});
	}

	return { rows, usdNgnRate: pricing.usdNgnRate, marginPercent: pricing.marginPercent };
}

/** Persist per-tier price + active flag from the admin table. A tier can't go active at price 0. */
export async function updateNumbersTiers(
	updates: Array<{ tierId: string; priceNgn?: number; active?: boolean }>
): Promise<void> {
	const platformId = await getNumbersPlatformId();
	if (!platformId) return;
	for (const u of updates) {
		const tier = await prisma.category.findFirst({
			where: { id: u.tierId, parentId: platformId },
			select: { id: true, metadata: true }
		});
		if (!tier) continue;

		const md = (tier.metadata as Record<string, unknown>) || {};
		const pricing = (md.pricing as Record<string, unknown>) || { currency: 'NGN' };
		let price = readBasePrice(md);
		if (u.priceNgn != null && Number.isFinite(u.priceNgn) && u.priceNgn >= 0) {
			price = Math.round(u.priceNgn);
			pricing.base_price = price;
			pricing.currency = 'NGN';
			md.pricing = pricing;
		}

		const active = u.active === true && price > 0;
		await prisma.category.update({
			where: { id: tier.id },
			data: { metadata: md as Prisma.InputJsonValue, isActive: u.active == null ? undefined : active }
		});
	}
}

export interface NumbersStorefrontTier {
	tierId: string;
	serviceId: number;
	serviceName: string;
	countryId: number;
	countryName: string;
	priceNgn: number;
}

/** Active, priced tiers for the storefront, grouped by service. */
export async function getNumbersStorefront(): Promise<
	Array<{ serviceId: number; serviceName: string; tiers: NumbersStorefrontTier[] }>
> {
	const platformId = await getNumbersPlatformId();
	if (!platformId) return [];
	const tiers = await prisma.category.findMany({
		where: { parentId: platformId, isActive: true },
		select: { id: true, metadata: true },
		orderBy: { sortOrder: 'asc' }
	});

	const byService = new Map<number, { serviceId: number; serviceName: string; tiers: NumbersStorefrontTier[] }>();
	for (const tier of tiers) {
		const cfg = getPhoneTierConfig(tier.metadata);
		const price = readBasePrice(tier.metadata);
		if (!cfg || price <= 0) continue;
		if (!byService.has(cfg.serviceId))
			byService.set(cfg.serviceId, { serviceId: cfg.serviceId, serviceName: cfg.serviceName, tiers: [] });
		byService.get(cfg.serviceId)!.tiers.push({
			tierId: tier.id,
			serviceId: cfg.serviceId,
			serviceName: cfg.serviceName,
			countryId: cfg.countryId,
			countryName: cfg.countryName,
			priceNgn: price
		});
	}
	return [...byService.values()];
}
