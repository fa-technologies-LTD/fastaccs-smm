import { prisma } from '$lib/prisma';
import { Prisma } from '@prisma/client';
import * as hubman from './hubman';
import { getPhonePricingConfig, computeAutoPrice } from './phone-pricing';
import { getLowSuccessTierKeys } from './phone-analytics';
import { PHONE_TIER_KEYS, PHONE_DELIVERY_MODE, getPhoneTierConfig } from '$lib/helpers/phone-tier-config';

/**
 * Catalog management for the automated Numbers service.
 *
 * A Numbers tier is a Category with categoryType 'numbers_tier' under the single
 * 'numbers_platform' parent, carrying a hub-man service+country mapping in metadata
 * plus a FULLY-AUTOMATIC NGN price (metadata.pricing.base_price = cost × margin, ₦1,000
 * floor). Prices are never set by hand — they recompute on every catalog refresh from
 * the admin's USD rate + margin, so they can never go stale or show a loss.
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

/** Live cost (worst-case USD cents) + available stock per service for a country, from hub-man. */
export interface ServiceCost {
	costCents: number;
	available: number;
}
async function fetchCountryServiceCosts(
	countryId: number
): Promise<{ ok: boolean; costs: Map<number, ServiceCost> }> {
	const costs = new Map<number, ServiceCost>();
	try {
		const data = await hubman.getAvailableServices(countryId);
		const byService = data[String(countryId)] || {};
		for (const [sid, info] of Object.entries(byService)) {
			// Worst-case cost: any in-stock number could be up to max, so price + ceiling
			// must be anchored here so the margin holds for whichever number we actually rent.
			costs.set(Number(sid), {
				costCents: info.max_price_cents,
				available: Number(info.available_numbers_count) || 0
			});
		}
		return { ok: true, costs };
	} catch (error) {
		// A transient failure must NOT deactivate this country's tiers — signal it.
		console.error(`[phone-catalog] failed to fetch costs for country ${countryId}:`, (error as Error).message);
		return { ok: false, costs };
	}
}

function countryIdFromSlug(slug: string): number | null {
	const m = /country(\d+)$/.exec(slug);
	return m ? Number(m[1]) : null;
}

export interface CatalogSyncResult {
	created: number;
	refreshed: number;
	deactivated: number;
	countries: number;
}

/**
 * Sync the Numbers catalog.
 *
 * The catalog is a STABLE, curated set — we do NOT auto-add or auto-remove countries/apps
 * on a schedule (that churned the storefront hourly). Instead:
 *  - Default (refresh): re-fetch each EXISTING tier's live cost + stock and RECOMPUTE its
 *    automatic price (cost × margin, ₦1,000 floor). Auto-hides a tier from the storefront
 *    when it has no live stock (`auto_hidden`), but never hard-deactivates it — the admin's
 *    manual active flag is separate. Used by the daily cron.
 *  - `expand: true`: additionally create tiers for any currently-available combo not yet
 *    in the set (first seed / manual "Expand catalog").
 */
export async function syncNumbersCatalog(
	options: { expand?: boolean } = {}
): Promise<CatalogSyncResult> {
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
		select: { id: true, slug: true, metadata: true }
	});
	const idBySlug = new Map(existingTiers.map((t) => [t.slug, t.id]));

	// Fetch every country's cost + stock map in parallel (the heavy part).
	const fetched = new Map(
		await Promise.all(
			countryIds.map(async (cid) => [cid, await fetchCountryServiceCosts(cid)] as const)
		)
	);
	// Tiers our own delivery data says are failing too often — hidden alongside no-stock ones.
	const lowSuccessKeys = await getLowSuccessTierKeys().catch(() => new Set<string>());
	let created = 0;
	let refreshed = 0;

	for (const countryId of countryIds) {
		const meta = countryMeta.get(countryId) || { name: `Country ${countryId}`, code: '' };
		const costs = fetched.get(countryId)?.costs ?? new Map<number, ServiceCost>();
		for (const [serviceId, { costCents, available }] of costs) {
			if (!MAJOR_SERVICE_IDS.has(serviceId)) continue;
			const serviceName = SERVICE_NAME_BY_ID.get(serviceId)!;
			const slug = tierSlug(serviceId, countryId);
			const existingId = idBySlug.get(slug);

			// Refresh mode only touches tiers already in the curated set. New combos are
			// added only when explicitly expanding.
			if (!existingId && !options.expand) continue;

			// Fully-automatic price, recomputed from live cost every refresh (never stale).
			// Auto-hide from the storefront when there's no live stock OR delivery is failing.
			const autoPrice = computeAutoPrice(costCents, pricing);
			const noStock = available <= 0;
			const lowSuccess = lowSuccessKeys.has(`${serviceName}||${meta.name}`);
			const autoHidden = noStock || lowSuccess;
			const hideReason = noStock ? 'no_stock' : lowSuccess ? 'low_success' : null;
			const metadata: Prisma.InputJsonValue = {
				[PHONE_TIER_KEYS.deliveryMode]: PHONE_DELIVERY_MODE,
				[PHONE_TIER_KEYS.serviceId]: serviceId,
				[PHONE_TIER_KEYS.serviceName]: serviceName,
				[PHONE_TIER_KEYS.countryId]: countryId,
				[PHONE_TIER_KEYS.countryName]: meta.name,
				hub_country_code: meta.code,
				[PHONE_TIER_KEYS.expectedCostCents]: costCents,
				[PHONE_TIER_KEYS.availableCount]: available,
				[PHONE_TIER_KEYS.autoHidden]: autoHidden,
				[PHONE_TIER_KEYS.hideReason]: hideReason,
				pricing: { currency: 'NGN', base_price: autoPrice }
			};
			const name = `${serviceName} — ${meta.name}`;
			if (existingId) {
				// Refresh cost, price, stock and auto-hidden flag. Do NOT flip isActive —
				// that's the admin's manual switch; storefront visibility uses auto_hidden.
				await prisma.category.update({
					where: { id: existingId },
					data: { metadata }
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

	// Frozen set: never auto-deactivate. The admin removes tiers manually.
	return { created, refreshed, deactivated: 0, countries: countryIds.length };
}

/** Back-compat alias — the admin Refresh button + first-visit seed call this. */
export async function seedNumbersCatalog(): Promise<{ created: number; refreshed: number }> {
	// First-time seed / manual "Expand catalog" — adds any currently-available combos.
	const r = await syncNumbersCatalog({ expand: true });
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
	liveCostCents: number | null;
	priceNgn: number; // fully automatic (cost × margin, ₦1,000 floor) — read-only
	profitNgn: number; // priceNgn − liveCostNGN, for a quick margin read
	available: number; // live stock at last fetch
	autoHidden: boolean; // hidden from storefront by the auto-rules
	hideReason: string | null; // 'no_stock' | 'low_success'
	active: boolean; // admin manual switch
}

/**
 * Rows for the admin Numbers table: each tier with its live cost, its automatic price,
 * realized profit, live stock, the auto-hide flag + reason, and the admin's active switch.
 * Prices are NOT editable here — they recompute automatically from the USD rate + margin.
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

	// Refresh live costs + stock once per country.
	const countryIds = [...new Set(tiers.map((t) => getPhoneTierConfig(t.metadata)?.countryId).filter((x): x is number => x != null))];
	const liveCosts = new Map<number, Map<number, ServiceCost>>();
	await Promise.all(
		countryIds.map(async (cid) => liveCosts.set(cid, (await fetchCountryServiceCosts(cid)).costs))
	);

	const rows: NumbersAdminRow[] = [];
	for (const tier of tiers) {
		const cfg = getPhoneTierConfig(tier.metadata);
		if (!cfg) continue;
		const live = liveCosts.get(cfg.countryId)?.get(cfg.serviceId) ?? null;
		const costCents = live?.costCents ?? cfg.expectedCostCents;
		const priceNgn = costCents ? computeAutoPrice(costCents, pricing) : readBasePrice(tier.metadata);
		const costNgn = (costCents / 100) * pricing.usdNgnRate;
		// Live stock decides no_stock; low_success comes from the stored flag (delivery history).
		const liveNoStock = live ? live.available <= 0 : cfg.hideReason === 'no_stock';
		const autoHidden = liveNoStock || cfg.autoHidden;
		const hideReason = liveNoStock ? 'no_stock' : cfg.autoHidden ? cfg.hideReason ?? 'no_stock' : null;
		rows.push({
			tierId: tier.id,
			serviceId: cfg.serviceId,
			serviceName: cfg.serviceName,
			countryId: cfg.countryId,
			countryName: cfg.countryName,
			liveCostCents: live?.costCents ?? null,
			priceNgn,
			profitNgn: Math.round(priceNgn - costNgn),
			available: live?.available ?? cfg.availableCount,
			autoHidden,
			hideReason,
			active: tier.isActive
		});
	}

	return { rows, usdNgnRate: pricing.usdNgnRate, marginPercent: pricing.marginPercent };
}

/**
 * Persist the admin's manual active switch from the Numbers table. Prices are automatic
 * and never set here. A tier can't go active with no computed price.
 */
export async function updateNumbersTiers(
	updates: Array<{ tierId: string; active?: boolean }>
): Promise<void> {
	const platformId = await getNumbersPlatformId();
	if (!platformId) return;
	for (const u of updates) {
		if (u.active == null) continue;
		const tier = await prisma.category.findFirst({
			where: { id: u.tierId, parentId: platformId },
			select: { id: true, metadata: true }
		});
		if (!tier) continue;
		const active = u.active === true && readBasePrice(tier.metadata) > 0;
		await prisma.category.update({ where: { id: tier.id }, data: { isActive: active } });
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
	// Fail-safe: never offer numbers the backend can't actually rent (e.g. token not
	// configured in this environment) — the storefront shows "coming soon" instead.
	if (!hubman.isHubmanConfigured()) return [];
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
		// Skip tiers the auto-rules pulled (no live stock / failing) even while isActive stays on.
		if (!cfg || price <= 0 || cfg.autoHidden) continue;
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
