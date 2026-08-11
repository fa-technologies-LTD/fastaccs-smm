import { prisma } from '$lib/prisma';
import { Prisma } from '@prisma/client';
import * as hubman from './hubman';
import * as pvapins from './pvapins';
import { serviceByHubId, pvapinsAppsForService, findPvapinsCountry } from './number-providers/service-map';
import { getPhonePricingConfig, computeAutoPrice } from './phone-pricing';
import {
	getLowSuccessTierKeys,
	getRealizedCostByTier,
	REALIZED_COST_PRIOR_STRENGTH,
	type RealizedTierCost
} from './phone-analytics';
import { triggerNumbersRestockForTier } from './restock-notifications';
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
			// PRICING basis = the CHEAPEST (min) live cost — the competitive, typical figure we
			// actually rent at. (We no longer anchor the sticker to the worst-case max; the wide
			// delivery ceiling in fulfilment, not the price, is what guarantees rents fill.)
			costs.set(Number(sid), {
				costCents: info.min_price_cents,
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

/**
 * A signature of the only tier fields the sync ever changes (cost, price, stock, hidden flag,
 * source). Comparing it lets a frequent sync SKIP writing tiers that didn't actually change —
 * so we can run every few minutes for live availability without churning the DB.
 */
function economicsSignature(metadata: unknown): string {
	const m =
		metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? (metadata as Record<string, unknown>)
			: {};
	const pricing =
		m.pricing && typeof m.pricing === 'object' ? (m.pricing as Record<string, unknown>) : {};
	return JSON.stringify([
		m[PHONE_TIER_KEYS.expectedCostCents] ?? null,
		pricing.base_price ?? null,
		m[PHONE_TIER_KEYS.availableCount] ?? null,
		m[PHONE_TIER_KEYS.autoHidden] ?? null,
		m[PHONE_TIER_KEYS.hideReason] ?? null,
		m.primary_source ?? null
	]);
}

/**
 * Self-tuning price basis: shrink the listed (catalog) cost toward what we ACTUALLY realized for
 * this tier, weighted by how much clean data we have. weight = n/(n+K) — with no clean samples the
 * listed prior is used unchanged; as clean rents accumulate, realized cost takes over smoothly, so
 * one weird rent never reprices a tier and price re-centers on reality over time.
 */
export function blendedBasisCents(listedCents: number, realized: RealizedTierCost | undefined): number {
	if (!realized || realized.count <= 0 || realized.medianCents <= 0) return Math.max(0, listedCents);
	const w = realized.count / (realized.count + REALIZED_COST_PRIOR_STRENGTH);
	return Math.max(1, Math.round(w * realized.medianCents + (1 - w) * Math.max(0, listedCents)));
}

// A tier is "thin" when the climbing room left after the hard profit floor is barely above the
// typical supplier cost — so losing the cheap variant pushes the next one over the ceiling and we
// refund. headroom = (price − floor) / cost; below this multiple = thin (admin guidance only, the
// system never changes the floor on its own — the owner sets a per-tier override).
export const THIN_TIER_HEADROOM_MULTIPLE = 2;
export function isThinTier(priceNgn: number, costNgn: number, floorNgn: number): boolean {
	if (!(costNgn > 0) || !(priceNgn > 0)) return false;
	return (priceNgn - floorNgn) / costNgn < THIN_TIER_HEADROOM_MULTIPLE;
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
	// Realized per-tier cost (clean, post-epoch) to self-tune the price basis. Fail-soft: an empty
	// map just means every tier prices off its listed catalog cost (the safe cold-start prior).
	const realizedByTier = await getRealizedCostByTier().catch(() => new Map<string, RealizedTierCost>());
	const basisFor = (serviceId: number, countryId: number, listedCents: number): number =>
		blendedBasisCents(listedCents, realizedByTier.get(`${serviceId}||${countryId}`));

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
	const metaBySlug = new Map(existingTiers.map((t) => [t.slug, t.metadata]));
	// Prior auto-hidden state per tier, to detect an unavailable→available transition (restock).
	const wasHiddenBySlug = new Map(
		existingTiers.map((t) => [t.slug, getPhoneTierConfig(t.metadata)?.autoHidden ?? false])
	);
	// Tiers that just came back in stock this sync → notify their "Notify me" subscribers.
	const becameAvailable: Array<{ tierId: string; name: string; price: number }> = [];

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
	// Every service+country hub-man actually reported this sync — used afterwards to flag
	// existing tiers hub-man has rotated OUT (so they don't sit on stale "OK" metadata).
	const seenSlugs = new Set<string>();

	for (const countryId of countryIds) {
		const meta = countryMeta.get(countryId) || { name: `Country ${countryId}`, code: '' };
		const costs = fetched.get(countryId)?.costs ?? new Map<number, ServiceCost>();
		for (const [serviceId, { costCents, available }] of costs) {
			if (!MAJOR_SERVICE_IDS.has(serviceId)) continue;
			const serviceName = SERVICE_NAME_BY_ID.get(serviceId)!;
			const slug = tierSlug(serviceId, countryId);
			seenSlugs.add(slug);
			const existingId = idBySlug.get(slug);

			// Refresh mode only touches tiers already in the curated set. New combos are
			// added only when explicitly expanding.
			if (!existingId && !options.expand) continue;

			// Fully-automatic price, recomputed from live cost every refresh (never stale) — UNLESS
			// the admin manually locked this tier's price, in which case we keep their figure.
			// Auto-hide from the storefront when there's no live stock OR delivery is failing.
			const oldMd = metaBySlug.get(slug);
			const locked = isPriceLocked(oldMd);
			const autoPrice = computeAutoPrice(basisFor(serviceId, countryId, costCents), pricing);
			const finalPrice = locked ? readBasePrice(oldMd) || autoPrice : autoPrice;
			const noStock = available <= 0;
			const lowSuccess = lowSuccessKeys.has(`${serviceName}||${meta.name}`);
			const autoHidden = noStock || lowSuccess;
			const hideReason = noStock ? 'no_stock' : lowSuccess ? 'low_success' : null;
			// This path rebuilds metadata from scratch, so carry over the admin's per-tier hard-floor
			// override (the sync must never wipe it — it's set out-of-band via updateNumbersTiers).
			const floorOverride = getPhoneTierConfig(oldMd)?.minFulfillmentProfitNgn ?? null;
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
				primary_source: 'hubman',
				price_locked: locked,
				pricing: { currency: 'NGN', base_price: finalPrice },
				...(floorOverride != null ? { [PHONE_TIER_KEYS.minFulfillmentProfitNgn]: floorOverride } : {})
			};
			const name = `${serviceName} — ${meta.name}`;
			if (existingId) {
				// Refresh cost, price, stock and auto-hidden flag ONLY when something changed —
				// so a frequent (every-few-minutes) sync doesn't rewrite unchanged tiers. Do NOT
				// flip isActive — that's the admin's manual switch; visibility uses auto_hidden.
				if (economicsSignature(metaBySlug.get(slug)) !== economicsSignature(metadata)) {
					await prisma.category.update({ where: { id: existingId }, data: { metadata } });
					refreshed += 1;
				}
				// Unavailable → available transition: queue a restock notification for subscribers.
				if ((wasHiddenBySlug.get(slug) ?? false) && !autoHidden) {
					becameAvailable.push({ tierId: existingId, name, price: autoPrice });
				}
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

	// Flag existing tiers hub-man rotated OUT since the last sync (no longer in availability),
	// so they hide from the storefront and read accurately in admin — instead of keeping stale
	// "OK" metadata forever. Guarded so a transient blip can't hide the whole catalog:
	//  - only when we actually got a countries list (empty list already returned early above),
	//  - skip a country whose per-country fetch FAILED this run (transient, not a real rotation).
	let rotatedOut = 0;
	let revivedByPvapins = 0;
	// Empty countries list = a hub-man blip, not "everything rotated out" — never mass-hide.
	const availabilityIsTrustworthy = countryIds.length > 0;

	// pvapins fills hub-man's gaps: a tier hub-man rotated out stays LIVE (priced from pvapins)
	// if pvapins carries that service+country. Fetched lazily and cached per country. Fail-soft.
	const pvapinsReady = pvapins.isPvapinsConfigured();
	const pvCountries = pvapinsReady ? await pvapins.loadCountries().catch(() => []) : [];
	type PvApps = Awaited<ReturnType<typeof pvapins.loadApps>>;
	const pvAppsByCountryId = new Map<number, PvApps | 'failed'>();
	// Returns coverage (revive), null (pvapins genuinely has none → mark no-stock), or
	// 'fetch_failed' (a transient pvapins error — leave the tier as-is, never flip it to no-stock).
	async function pvapinsFillFor(
		hubCode: string,
		hubName: string,
		serviceId: number
	): Promise<{ costCents: number; count: number } | null | 'fetch_failed'> {
		if (!pvapinsReady) return null;
		if (pvCountries.length === 0) return 'fetch_failed'; // loadCountries failed/blipped
		const service = serviceByHubId(serviceId);
		if (!service) return null;
		const country = findPvapinsCountry(pvCountries, hubCode, hubName);
		if (!country) return null;
		let apps = pvAppsByCountryId.get(country.id);
		if (apps === undefined) {
			apps = await pvapins.loadApps(country.id).catch(() => 'failed' as const);
			pvAppsByCountryId.set(country.id, apps);
		}
		if (apps === 'failed') return 'fetch_failed';
		const matched = pvapinsAppsForService(service.pvapinsPrefixes, apps);
		const costs = matched
			.map((a) => pvapins.usdStringToCents(a.deduct))
			.filter((n) => n > 0)
			.sort((a, b) => a - b);
		if (costs.length === 0) return null;
		// PRICING basis = the ~35th-percentile (low/typical) variant cost — the cheap cluster we
		// actually rent from, not the expensive tail. Pricing off the tail (old p90) produced
		// uncompetitive stickers (USA WhatsApp ≈ ₦8,800) and killed sales, even though the sweep
		// almost always rents a ~$0.50 variant. The wide fulfilment ceiling still lets us climb to
		// a pricier in-stock variant at a bounded loss, so a low sticker doesn't cost reliability.
		// Nearest-rank on (length-1); for a handful of variants it lands in the cheap third.
		const idx = Math.max(0, Math.min(costs.length - 1, Math.round(0.35 * (costs.length - 1))));
		return { costCents: costs[idx], count: matched.length };
	}

	// Pre-fetch pvapins app lists for every gap country IN PARALLEL (each is large + slow). Doing
	// them sequentially blew the time budget and caused slow fetches to fail → tiers flickering
	// hidden. Parallel + cached makes the gap-fill fast and reliable.
	if (pvapinsReady && pvCountries.length > 0) {
		const gapCountryIds = new Set<number>();
		for (const t of existingTiers) {
			if (seenSlugs.has(t.slug)) continue;
			const cfg = getPhoneTierConfig(t.metadata);
			if (!cfg) continue;
			const code = String((t.metadata as Record<string, unknown>)?.hub_country_code ?? '');
			const country = findPvapinsCountry(pvCountries, code, cfg.countryName);
			if (country) gapCountryIds.add(country.id);
		}
		await Promise.all(
			[...gapCountryIds].map(async (id) => {
				if (pvAppsByCountryId.has(id)) return;
				pvAppsByCountryId.set(id, await pvapins.loadApps(id).catch(() => 'failed' as const));
			})
		);
	}

	for (const t of existingTiers) {
		if (!availabilityIsTrustworthy) break;
		if (seenSlugs.has(t.slug)) continue;
		const cid = countryIdFromSlug(t.slug);
		if (cid == null) continue;
		const countryFetch = fetched.get(cid);
		if (countryFetch && !countryFetch.ok) continue; // transient fetch failure — leave as-is
		const md =
			t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
				? { ...(t.metadata as Record<string, unknown>) }
				: {};

		// Can pvapins fill this hub-man gap? Revive it (priced from pvapins) instead of hiding.
		const cfg = getPhoneTierConfig(t.metadata);
		const fill = cfg
			? await pvapinsFillFor(String(md.hub_country_code ?? ''), cfg.countryName, cfg.serviceId)
			: null;
		// A transient pvapins failure must NOT flip a tier to no-stock — leave it exactly as it is.
		if (fill === 'fetch_failed') continue;
		if (fill && cfg) {
			const wasHidden = md[PHONE_TIER_KEYS.autoHidden] === true;
			// Keep a manually-locked price; otherwise price automatically from the pvapins cost basis.
			const pvBasis = basisFor(cfg.serviceId, cfg.countryId, fill.costCents);
			const price = isPriceLocked(t.metadata)
				? readBasePrice(t.metadata) || computeAutoPrice(pvBasis, pricing)
				: computeAutoPrice(pvBasis, pricing);
			md[PHONE_TIER_KEYS.expectedCostCents] = fill.costCents;
			md[PHONE_TIER_KEYS.availableCount] = fill.count;
			md[PHONE_TIER_KEYS.autoHidden] = false;
			md[PHONE_TIER_KEYS.hideReason] = null;
			md.primary_source = 'pvapins';
			md.pricing = { currency: 'NGN', base_price: price };
			if (economicsSignature(t.metadata) !== economicsSignature(md)) {
				await prisma.category.update({ where: { id: t.id }, data: { metadata: md as Prisma.InputJsonValue } });
				revivedByPvapins += 1;
			}
			if (wasHidden) {
				becameAvailable.push({ tierId: t.id, name: `${cfg.serviceName} — ${cfg.countryName}`, price });
			}
			continue;
		}

		// Already flagged no-stock? Skip the write.
		if (md[PHONE_TIER_KEYS.autoHidden] === true && md[PHONE_TIER_KEYS.hideReason] === 'no_stock') {
			continue;
		}
		md[PHONE_TIER_KEYS.availableCount] = 0;
		md[PHONE_TIER_KEYS.autoHidden] = true;
		md[PHONE_TIER_KEYS.hideReason] = 'no_stock';
		await prisma.category.update({
			where: { id: t.id },
			data: { metadata: md as Prisma.InputJsonValue }
		});
		rotatedOut += 1;
	}
	if (revivedByPvapins > 0) {
		console.log(`[phone-catalog] pvapins filled ${revivedByPvapins} hub-man gap tier(s)`);
	}

	// Notify "Notify me" subscribers for tiers that came back in stock (best-effort, never
	// blocks the sync). Each subscription is consumed (notifiedAt set) so it fires once.
	for (const t of becameAvailable) {
		await triggerNumbersRestockForTier(t.tierId, t.name, t.price).catch((e) =>
			console.error('[phone-catalog] restock notify failed for', t.tierId, (e as Error).message)
		);
	}

	// "deactivated" here = tiers flagged out of stock this run. We never hard-deactivate.
	return { created, refreshed, deactivated: rotatedOut, countries: countryIds.length };
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

/** A tier whose price the admin manually set — the auto-recompute must NOT overwrite it. */
function isPriceLocked(metadata: unknown): boolean {
	return Boolean(
		metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).price_locked === true
	);
}

export interface NumbersAdminRow {
	tierId: string;
	serviceId: number;
	serviceName: string;
	countryId: number;
	countryName: string;
	liveCostCents: number | null;
	costCents: number; // effective cost used for pricing (USD cents) — for live profit calc
	priceNgn: number; // fully automatic (cost × margin, ₦1,000 floor) — read-only
	profitNgn: number; // priceNgn − liveCostNGN, for a quick margin read
	available: number; // live stock at last fetch
	autoHidden: boolean; // hidden from storefront by the auto-rules
	hideReason: string | null; // 'no_stock' | 'low_success'
	active: boolean; // admin manual switch
	primarySource: string; // 'hubman' | 'pvapins' — which source currently backs this tier
	priceLocked: boolean; // admin manually set this price (auto-recompute won't overwrite it)
	minFulfillmentProfitNgn: number; // effective hard profit floor for this tier (override ?? global)
	floorOverridden: boolean; // true when this tier carries its own floor (not the global default)
	thin: boolean; // headroom < ~2× — a candidate for a lower (e.g. ₦200) per-tier floor
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
	const realizedByTier = await getRealizedCostByTier().catch(() => new Map<string, RealizedTierCost>());
	await Promise.all(
		countryIds.map(async (cid) => liveCosts.set(cid, (await fetchCountryServiceCosts(cid)).costs))
	);

	const rows: NumbersAdminRow[] = [];
	for (const tier of tiers) {
		const cfg = getPhoneTierConfig(tier.metadata);
		if (!cfg) continue;
		const primarySource = String((tier.metadata as Record<string, unknown>)?.primary_source ?? 'hubman');
		const isPvapins = primarySource === 'pvapins';
		// hub-man tiers get a fresh live cost/stock; pvapins tiers TRUST the stored two-source state
		// (hub-man live is irrelevant to them — that's what made them wrongly read "0 / no stock").
		const live = isPvapins ? null : (liveCosts.get(cfg.countryId)?.get(cfg.serviceId) ?? null);
		const costCents = live?.costCents ?? cfg.expectedCostCents;
		const priceLocked = isPriceLocked(tier.metadata);
		const basisCents = blendedBasisCents(costCents, realizedByTier.get(`${cfg.serviceId}||${cfg.countryId}`));
		// Locked tiers show the admin's figure; otherwise the automatic price (same basis as sync).
		const priceNgn = priceLocked
			? readBasePrice(tier.metadata)
			: costCents
				? computeAutoPrice(basisCents, pricing)
				: readBasePrice(tier.metadata);
		const costNgn = (costCents / 100) * pricing.usdNgnRate;
		const effectiveFloorNgn = cfg.minFulfillmentProfitNgn ?? pricing.minFulfillmentProfitNgn;
		const thin = isThinTier(priceNgn, costNgn, effectiveFloorNgn);
		const liveNoStock = isPvapins ? false : live ? live.available <= 0 : cfg.hideReason === 'no_stock';
		const autoHidden = isPvapins ? cfg.autoHidden : liveNoStock || cfg.autoHidden;
		const hideReason = isPvapins
			? cfg.hideReason
			: liveNoStock
				? 'no_stock'
				: cfg.autoHidden
					? cfg.hideReason ?? 'no_stock'
					: null;
		rows.push({
			tierId: tier.id,
			serviceId: cfg.serviceId,
			serviceName: cfg.serviceName,
			countryId: cfg.countryId,
			countryName: cfg.countryName,
			liveCostCents: live?.costCents ?? (isPvapins ? costCents : null),
			costCents,
			priceNgn,
			profitNgn: Math.round(priceNgn - costNgn),
			available: isPvapins ? cfg.availableCount : live?.available ?? cfg.availableCount,
			autoHidden,
			hideReason,
			active: tier.isActive,
			primarySource,
			priceLocked,
			minFulfillmentProfitNgn: effectiveFloorNgn,
			floorOverridden: cfg.minFulfillmentProfitNgn != null,
			thin
		});
	}

	return { rows, usdNgnRate: pricing.usdNgnRate, marginPercent: pricing.marginPercent };
}

/**
 * Persist the admin's manual active switch from the Numbers table. Prices are automatic
 * and never set here. A tier can't go active with no computed price.
 */
export async function updateNumbersTiers(
	updates: Array<{
		tierId: string;
		active?: boolean;
		priceNgn?: number;
		lockPrice?: boolean;
		minFulfillmentProfitNgn?: number | null; // per-tier hard floor; null clears it (→ global default)
	}>
): Promise<void> {
	const platformId = await getNumbersPlatformId();
	if (!platformId) return;
	for (const u of updates) {
		const tier = await prisma.category.findFirst({
			where: { id: u.tierId, parentId: platformId },
			select: { id: true, metadata: true }
		});
		if (!tier) continue;
		const md =
			tier.metadata && typeof tier.metadata === 'object' && !Array.isArray(tier.metadata)
				? { ...(tier.metadata as Record<string, unknown>) }
				: {};
		const pricing: Record<string, unknown> =
			md.pricing && typeof md.pricing === 'object'
				? { ...(md.pricing as Record<string, unknown>) }
				: { currency: 'NGN' };

		// Manual price override — persists across the auto-recompute until unlocked.
		if (u.priceNgn != null && Number.isFinite(u.priceNgn) && u.priceNgn >= 0) {
			pricing.base_price = Math.round(u.priceNgn);
			pricing.currency = 'NGN';
			md.pricing = pricing;
			md.price_locked = true;
		}
		// Explicit unlock → the next sync recomputes the automatic price.
		if (u.lockPrice === false) md.price_locked = false;

		// Per-tier hard fulfilment-profit floor override. A number sets it; null clears it (the tier
		// falls back to the global ₦500). The catalog sync never touches this key, so it persists.
		if (u.minFulfillmentProfitNgn === null) {
			delete md[PHONE_TIER_KEYS.minFulfillmentProfitNgn];
		} else if (u.minFulfillmentProfitNgn != null && Number.isFinite(u.minFulfillmentProfitNgn) && u.minFulfillmentProfitNgn >= 0) {
			md[PHONE_TIER_KEYS.minFulfillmentProfitNgn] = Math.round(u.minFulfillmentProfitNgn);
		}

		const data: Prisma.CategoryUpdateInput = { metadata: md as Prisma.InputJsonValue };
		if (u.active != null) data.isActive = u.active === true && readBasePrice(md) > 0;
		await prisma.category.update({ where: { id: tier.id }, data });
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
	available: boolean; // false = temporarily out of stock / rotated out → shown muted, not buyable
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
		if (!cfg || price <= 0) continue;
		// Persistently-failing tiers are removed entirely — not shown as "temporarily unavailable".
		if (cfg.hideReason === 'low_success') continue;
		// Buyable now if the (two-source) sync says it has stock. autoHidden is maintained every
		// 5 min across BOTH hub-man and pvapins, so a pvapins-only country (e.g. USA when hub-man
		// is out) correctly shows available. Out-of-stock ones stay muted ("usually offered").
		// The buy-time candidate pool + failover is the authoritative backstop either way.
		const available = !cfg.autoHidden;
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
			priceNgn: price,
			available
		});
	}
	// Available countries first (cheapest first), unavailable ones muted at the bottom; apps
	// in curated order.
	const order = new Map<number, number>(MAJOR_SERVICES.map((s, i) => [s.id, i]));
	for (const group of byService.values())
		group.tiers.sort((a, b) =>
			a.available === b.available ? a.priceNgn - b.priceNgn : a.available ? -1 : 1
		);
	return [...byService.values()].sort(
		(a, b) => (order.get(a.serviceId) ?? 999) - (order.get(b.serviceId) ?? 999)
	);
}
