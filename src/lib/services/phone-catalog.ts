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

// The 20 curated apps to stock (verified hub-man service IDs). Countries are NOT
// curated — they're synced live from hub-man's rotating availability (see syncNumbersCatalog).
export const MAJOR_SERVICES = [
	{ id: 1, name: 'WhatsApp' },
	{ id: 2, name: 'Telegram' },
	{ id: 7, name: 'Instagram' },
	{ id: 11, name: 'Facebook' },
	{ id: 3, name: 'Google / Gmail' },
	{ id: 50, name: 'TikTok' },
	{ id: 47, name: 'Discord' },
	{ id: 12, name: 'X / Twitter' },
	{ id: 73, name: 'Snapchat' },
	{ id: 28, name: 'Tinder' },
	{ id: 13, name: 'Uber' },
	{ id: 60, name: 'Amazon' },
	{ id: 41, name: 'Netflix' },
	{ id: 120, name: 'PayPal' },
	{ id: 9, name: 'Viber' },
	{ id: 2419, name: 'OpenAI / ChatGPT' },
	{ id: 27, name: 'Steam' },
	{ id: 122, name: 'Coinbase' },
	{ id: 355, name: 'Revolut' },
	{ id: 258, name: 'Bumble' }
] as const;

const MAJOR_SERVICE_IDS = new Set<number>(MAJOR_SERVICES.map((s) => s.id));
const SERVICE_NAME_BY_ID = new Map<number, string>(MAJOR_SERVICES.map((s) => [s.id, s.name]));

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

export interface CatalogSyncResult {
	created: number;
	refreshed: number;
	deactivated: number;
	countries: number;
}

/**
 * Sync the Numbers catalog to hub-man's LIVE availability.
 *
 * For every currently-available country × curated app that is in stock, upsert an
 * ACTIVE, AUTO-PRICED tier (price = cost × rate × margin). Any tier whose combo is no
 * longer available is deactivated (hidden from the storefront). hub-man only offers a
 * rotating ~7-8 countries at a time, so this keeps the storefront showing exactly what
 * is really buyable, with zero per-country upkeep. Called by the admin Refresh button
 * and the hourly cron.
 */
export async function syncNumbersCatalog(): Promise<CatalogSyncResult> {
	const platformId = await ensureNumbersPlatform();
	const pricing = await getPhonePricingConfig();

	let countryIds: number[] = [];
	try {
		countryIds = await hubman.getAvailableCountryIds();
	} catch (error) {
		console.error('[phone-catalog] failed to fetch available countries:', (error as Error).message);
		return { created: 0, refreshed: 0, deactivated: 0, countries: 0 };
	}

	// Country name + ISO code from the master catalog (for display + flag emoji).
	const countryMeta = new Map<number, { name: string; code: string }>();
	try {
		const catalog = await hubman.getCatalog();
		for (const c of catalog.countries) countryMeta.set(c.id, { name: c.name, code: c.code });
	} catch (error) {
		console.error('[phone-catalog] failed to fetch master catalog:', (error as Error).message);
	}

	// Fetch existing tiers once (slug → id) to avoid a query per combo.
	const existingTiers = await prisma.category.findMany({
		where: { parentId: platformId },
		select: { id: true, slug: true }
	});
	const idBySlug = new Map(existingTiers.map((t) => [t.slug, t.id]));

	// Fetch every country's cost map in parallel (the heavy part).
	const costsByCountry = new Map<number, Map<number, number>>(
		await Promise.all(
			countryIds.map(async (cid) => [cid, await fetchCountryServiceCosts(cid)] as const)
		)
	);

	const liveSlugs = new Set<string>();
	let created = 0;
	let refreshed = 0;

	for (const countryId of countryIds) {
		const meta = countryMeta.get(countryId) || { name: `Country ${countryId}`, code: '' };
		const costs = costsByCountry.get(countryId) ?? new Map();
		for (const [serviceId, cost] of costs) {
			if (!MAJOR_SERVICE_IDS.has(serviceId)) continue;
			const serviceName = SERVICE_NAME_BY_ID.get(serviceId)!;
			const slug = tierSlug(serviceId, countryId);
			liveSlugs.add(slug);

			const metadata: Prisma.InputJsonValue = {
				[PHONE_TIER_KEYS.deliveryMode]: PHONE_DELIVERY_MODE,
				[PHONE_TIER_KEYS.serviceId]: serviceId,
				[PHONE_TIER_KEYS.serviceName]: serviceName,
				[PHONE_TIER_KEYS.countryId]: countryId,
				[PHONE_TIER_KEYS.countryName]: meta.name,
				hub_country_code: meta.code,
				[PHONE_TIER_KEYS.expectedCostCents]: cost,
				pricing: { currency: 'NGN', base_price: computeSaleNgn(cost, pricing) }
			};
			const name = `${serviceName} — ${meta.name}`;
			const existingId = idBySlug.get(slug);
			if (existingId) {
				await prisma.category.update({
					where: { id: existingId },
					data: { name, isActive: true, metadata }
				});
				refreshed += 1;
			} else {
				const row = await prisma.category.create({
					data: {
						name,
						slug,
						categoryType: NUMBERS_TIER_TYPE,
						parentId: platformId,
						isActive: true,
						sortOrder: serviceId * 1000 + countryId,
						metadata
					},
					select: { id: true }
				});
				idBySlug.set(slug, row.id);
				created += 1;
			}
		}
	}

	// Deactivate any tier whose combo is no longer available (single query).
	const stale = existingTiers.filter((t) => !liveSlugs.has(t.slug)).map((t) => t.id);
	let deactivated = 0;
	if (stale.length) {
		const res = await prisma.category.updateMany({
			where: { id: { in: stale }, isActive: true },
			data: { isActive: false }
		});
		deactivated = res.count;
	}

	return { created, refreshed, deactivated, countries: countryIds.length };
}

/** Back-compat alias — the admin Refresh button + first-visit seed call this. */
export async function seedNumbersCatalog(): Promise<{ created: number; refreshed: number }> {
	const r = await syncNumbersCatalog();
	return { created: r.created, refreshed: r.refreshed };
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
	countryCode: string;
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
		const countryCode = String((tier.metadata as Record<string, unknown>)?.hub_country_code || '');
		if (!byService.has(cfg.serviceId))
			byService.set(cfg.serviceId, { serviceId: cfg.serviceId, serviceName: cfg.serviceName, tiers: [] });
		byService.get(cfg.serviceId)!.tiers.push({
			tierId: tier.id,
			serviceId: cfg.serviceId,
			serviceName: cfg.serviceName,
			countryId: cfg.countryId,
			countryName: cfg.countryName,
			countryCode,
			priceNgn: price
		});
	}
	// Cheapest country first within each app; apps in curated order.
	const order = new Map<number, number>(MAJOR_SERVICES.map((s, i) => [s.id, i]));
	for (const group of byService.values()) group.tiers.sort((a, b) => a.priceNgn - b.priceNgn);
	return [...byService.values()].sort(
		(a, b) => (order.get(a.serviceId) ?? 999) - (order.get(b.serviceId) ?? 999)
	);
}
