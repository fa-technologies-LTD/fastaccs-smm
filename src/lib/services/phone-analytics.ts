import { prisma } from '$lib/prisma';
import { getPhoneTierConfig } from '$lib/helpers/phone-tier-config';
import {
	computeProcurementCeilingCents,
	getPhonePricingConfig,
	NUMBERS_CLEAN_EPOCH
} from './phone-pricing';
import { getBalanceCents, isHubmanConfigured } from './hubman';
import {
	exactRouteReliabilityKey,
	ROUTE_HEALTH_ATTEMPT_OUTCOMES,
	routeProtectionState,
	summarizeRouteHealth,
	type ReliabilityStat
} from './number-providers/reliability';

/**
 * Analytics for the Numbers service — how each hub-man service/country performs and
 * where customers hit problems (no-SMS refunds). Computed from our own PhoneRental
 * records so it needs no extra hub-man calls. Volumes are low; we aggregate in JS.
 */

const RECEIVED = 'received';
const FAILED_STATES = new Set(['refunded', 'expired', 'cancelled', 'failed']);

function tierBasePrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const raw = metadata as Record<string, unknown>;
	if (!raw.pricing || typeof raw.pricing !== 'object' || Array.isArray(raw.pricing)) return 0;
	const value = Number((raw.pricing as Record<string, unknown>).base_price);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

// Only recent evidence counts. Exact-route cooldowns decide when a cautious canary is allowed.
export const SUCCESS_HIDE_WINDOW_DAYS = 14;

/**
 * Tiers to mute when the current sellable supplier set is empty or every route in it is blocked.
 *
 * A product-wide failure streak must not suppress healthy or unexplored alternatives. Routes that
 * have finished their cooldown return only on probation (at the bottom of the fulfilment queue),
 * so the tier can cautiously recover without pretending that elapsed time proved reliability. A
 * persisted, affordable route with no history is genuinely unexplored and keeps the product live.
 */
export async function getLowSuccessTierKeys(): Promise<Set<string>> {
	const since = new Date(Date.now() - SUCCESS_HIDE_WINDOW_DAYS * 86_400_000);
	const rentals = await prisma.phoneRental.findMany({
		where: { createdAt: { gte: since } },
		select: {
			orderItemId: true,
			serviceId: true,
			serviceName: true,
			countryId: true,
			countryName: true,
			status: true,
			createdAt: true,
			receivedAt: true,
			refundedAt: true,
			updatedAt: true
		}
	});
	if (rentals.length === 0) return new Set();
	const marketByOrderItem = new Map(
		rentals.map((r) => [
			r.orderItemId,
			{
				tierKey: `${r.serviceName}||${r.countryName}`,
				marketKey: `${r.serviceId}||${r.countryId}`,
				serviceId: r.serviceId,
				countryId: r.countryId
			}
		])
	);
	const attempts = await prisma.phoneAttempt.findMany({
		where: {
			orderItemId: { in: [...marketByOrderItem.keys()] },
			outcome: { in: ROUTE_HEALTH_ATTEMPT_OUTCOMES },
			createdAt: { gte: since }
		},
		select: {
			orderItemId: true,
			provider: true,
			providerServiceRef: true,
			outcome: true,
			createdAt: true,
			updatedAt: true
		}
	});
	const tierByRoute = new Map<string, string>();
	const evidence = attempts.flatMap((attempt) => {
		const market = marketByOrderItem.get(attempt.orderItemId);
		if (!market) return [];
		const routeKey = exactRouteReliabilityKey(
			attempt.provider || 'unknown',
			attempt.providerServiceRef,
			market.serviceId,
			market.countryId
		);
		tierByRoute.set(routeKey, market.tierKey);
		return [
			{
				key: routeKey,
				outcome: attempt.outcome,
				createdAt: attempt.createdAt,
				updatedAt: attempt.updatedAt
			}
		];
	});
	const routeStats = summarizeRouteHealth(evidence);
	const observedRoutesByTier = new Map<string, ReliabilityStat[]>();
	for (const [routeKey, stat] of routeStats) {
		const tierKey = tierByRoute.get(routeKey);
		if (!tierKey) continue;
		const routes = observedRoutesByTier.get(tierKey) ?? [];
		routes.push(stat);
		observedRoutesByTier.set(tierKey, routes);
	}
	const tierMarkets = new Map(
		rentals.map((rental) => [
			`${rental.serviceName}||${rental.countryName}`,
			`${rental.serviceId}||${rental.countryId}`
		])
	);
	const markets = [
		...new Map(
			rentals.map((rental) => [
				`${rental.serviceId}||${rental.countryId}`,
				{ serviceId: rental.serviceId, countryId: rental.countryId }
			])
		).values()
	];
	const marketFilter = markets.map(({ serviceId, countryId }) => ({ serviceId, countryId }));

	// Snapshot scope rows make a successful empty catalogue distinguishable from an API failure or a
	// market we have never inspected. Route rows then prove which alternatives are currently listed.
	// Fail back to observed-only behavior while the migration has not landed or inventory is unreadable.
	const inventory = await Promise.all([
		prisma.phoneSupplierCatalogScope.findMany({
			where: { OR: marketFilter },
			select: { serviceId: true, countryId: true }
		}),
		prisma.phoneSupplierCatalogRoute.findMany({
			where: { OR: marketFilter, unavailableAt: null, available: { gt: 0 } },
			select: { routeKey: true, serviceId: true, countryId: true, costCents: true }
		})
	])
		.then(([scopes, routes]) => ({ known: true, scopes, routes }))
		.catch(() => ({ known: false, scopes: [], routes: [] }));

	const [tierCategories, pricing] = await Promise.all([
		prisma.category.findMany({
			where: {
				slug: {
					in: markets.map(
						({ serviceId, countryId }) => `numbers-svc${serviceId}-country${countryId}`
					)
				}
			},
			select: { metadata: true }
		}),
		getPhonePricingConfig()
	]);
	const ceilingByMarket = new Map<string, number>();
	for (const category of tierCategories) {
		const cfg = getPhoneTierConfig(category.metadata);
		if (!cfg) continue;
		const priceNgn = tierBasePrice(category.metadata);
		const hardProfitFloor = Math.max(
			pricing.minFulfillmentProfitNgn,
			cfg.minFulfillmentProfitNgn ?? pricing.minFulfillmentProfitNgn
		);
		ceilingByMarket.set(
			`${cfg.serviceId}||${cfg.countryId}`,
			computeProcurementCeilingCents(priceNgn, hardProfitFloor, pricing.usdNgnRate)
		);
	}
	const cataloguedMarkets = new Set(
		inventory.scopes.map((scope) => `${scope.serviceId}||${scope.countryId}`)
	);
	const catalogRoutesByMarket = new Map<string, string[]>();
	for (const route of inventory.routes) {
		const marketKey = `${route.serviceId}||${route.countryId}`;
		const ceiling = ceilingByMarket.get(marketKey) ?? 0;
		// An unaffordable listing cannot fulfil this product without breaking the hard profit floor,
		// so it must not masquerade as an unexplored fallback that keeps checkout open.
		if (route.costCents > ceiling) continue;
		const rows = catalogRoutesByMarket.get(marketKey) ?? [];
		rows.push(route.routeKey);
		catalogRoutesByMarket.set(marketKey, rows);
	}
	const out = new Set<string>();
	for (const [tierKey, observedRoutes] of observedRoutesByTier) {
		const marketKey = tierMarkets.get(tierKey) ?? '';
		const snapshotKnown = inventory.known && cataloguedMarkets.has(marketKey);
		const catalogRouteKeys = catalogRoutesByMarket.get(marketKey) ?? [];
		const everyCurrentRouteBlocked = snapshotKnown
			? catalogRouteKeys.length === 0 ||
				catalogRouteKeys.every((routeKey) => {
					const stat = routeStats.get(routeKey);
					return stat ? routeProtectionState(stat) === 'blocked' : false;
				})
			: observedRoutes.every((route) => routeProtectionState(route) === 'blocked');
		if (everyCurrentRouteBlocked) {
			out.add(tierKey);
		}
	}
	return out;
}

// How far back realized cost is trusted, and the shrinkage prior strength (K). With `n` clean
// samples, price weight on realized cost = n/(n+K); below that it leans on the catalog prior. K≈20
// means a tier needs ~20 clean rents before realized cost dominates — smooth, not twitchy.
export const REALIZED_COST_WINDOW_DAYS = 14;
export const REALIZED_COST_PRIOR_STRENGTH = 20;

export interface RealizedTierCost {
	medianCents: number; // robust central cost we ACTUALLY paid (USD cents)
	count: number; // clean sample size, for the shrinkage weight
}

/**
 * Median realized supplier cost per tier (`serviceId||countryId`) from our own recent, CLEAN
 * `received` rentals — the self-tuning input to pricing. Median (not mean) so one expensive rescue
 * rent can't yank the basis. Only rentals received since the clean epoch (post-bugfix) count, so
 * corrupted-era outcomes never train price. Empty until real clean traffic exists → callers fall
 * back to the catalog prior.
 */
export async function getRealizedCostByTier(): Promise<Map<string, RealizedTierCost>> {
	const windowStart = Date.now() - REALIZED_COST_WINDOW_DAYS * 86_400_000;
	const since = new Date(Math.max(windowStart, NUMBERS_CLEAN_EPOCH.getTime()));
	const rentals = await prisma.phoneRental.findMany({
		where: { status: RECEIVED, receivedAt: { gte: since } },
		select: { orderItemId: true, serviceId: true, countryId: true, costCents: true }
	});
	const attempts = rentals.length
		? await prisma.phoneAttempt.findMany({
				where: {
					orderItemId: { in: rentals.map((r) => r.orderItemId) },
					actualCostCents: { not: null }
				},
				select: { orderItemId: true, actualCostCents: true }
			})
		: [];
	const actualByOrderItem = new Map<string, number>();
	for (const a of attempts) {
		actualByOrderItem.set(
			a.orderItemId,
			(actualByOrderItem.get(a.orderItemId) ?? 0) + Math.max(0, a.actualCostCents ?? 0)
		);
	}
	const byTier = new Map<string, number[]>();
	for (const r of rentals) {
		// Sum every charged attempt on the successful order (including an earlier failed supplier).
		// Fall back to the final-rental cost only for pre-telemetry historical rows.
		const realized = actualByOrderItem.has(r.orderItemId)
			? actualByOrderItem.get(r.orderItemId)!
			: (r.costCents ?? 0);
		if (realized <= 0) continue;
		const key = `${r.serviceId}||${r.countryId}`;
		let arr = byTier.get(key);
		if (!arr) byTier.set(key, (arr = []));
		arr.push(realized);
	}
	const out = new Map<string, RealizedTierCost>();
	for (const [key, costs] of byTier) {
		costs.sort((a, b) => a - b);
		const mid = Math.floor(costs.length / 2);
		const median = costs.length % 2 ? costs[mid] : Math.round((costs[mid - 1] + costs[mid]) / 2);
		out.set(key, { medianCents: median, count: costs.length });
	}
	return out;
}

export interface NumbersServiceStat {
	serviceName: string;
	countryName: string;
	total: number;
	received: number;
	refunded: number;
	inFlight: number;
	successRatePct: number | null;
	avgTimeToOtpSec: number | null;
	revenueNgn: number;
	costNgn: number;
	marginNgn: number;
	needsAttention: boolean;
}

export interface NumbersDemandStat {
	serviceId: number;
	serviceName: string;
	opens: number;
	purchases: number;
	deliveries: number;
}

export function summarizeNumbersDemand(
	rentals: Array<{ serviceId: number; serviceName: string; status: string }>,
	openEvents: Array<{ path: string }>
): NumbersDemandStat[] {
	const byService = new Map<number, NumbersDemandStat>();
	for (const rental of rentals) {
		const current = byService.get(rental.serviceId) ?? {
			serviceId: rental.serviceId,
			serviceName: rental.serviceName,
			opens: 0,
			purchases: 0,
			deliveries: 0
		};
		current.purchases += 1;
		if (rental.status === RECEIVED) current.deliveries += 1;
		byService.set(rental.serviceId, current);
	}
	for (const event of openEvents) {
		const match = /^\/numbers\/service\/(\d+)$/.exec(event.path);
		if (!match) continue;
		const serviceId = Number(match[1]);
		if (!Number.isInteger(serviceId) || serviceId <= 0) continue;
		const current = byService.get(serviceId) ?? {
			serviceId,
			serviceName: `Service ${serviceId}`,
			opens: 0,
			purchases: 0,
			deliveries: 0
		};
		current.opens += 1;
		byService.set(serviceId, current);
	}
	return [...byService.values()].sort(
		(a, b) =>
			b.deliveries - a.deliveries ||
			b.purchases - a.purchases ||
			b.opens - a.opens ||
			a.serviceId - b.serviceId
	);
}

export interface NumbersAnalytics {
	overall: {
		total: number;
		received: number;
		refunded: number;
		inFlight: number;
		successRatePct: number | null;
		revenueNgn: number;
		costNgn: number;
		marginNgn: number;
	};
	byService: NumbersServiceStat[];
	demand30d: NumbersDemandStat[];
	recent: Array<{
		createdAt: string;
		serviceName: string;
		countryName: string;
		phoneNumber: string | null;
		status: string;
		provider: string;
		saleNgn: number;
		costUsd: number | null;
		buyer: string | null;
		buyerUserId: string | null;
	}>;
}

export async function getNumbersAnalytics(): Promise<NumbersAnalytics> {
	const { usdNgnRate } = await getPhonePricingConfig();
	const demandSince = new Date(Date.now() - 30 * 86_400_000);
	const [rentals, serviceOpenEvents] = await Promise.all([
		prisma.phoneRental.findMany({
			orderBy: { createdAt: 'desc' },
			include: {
				orderItem: {
					select: {
						refundedAmount: true,
						order: { select: { user: { select: { id: true, email: true, fullName: true } } } }
					}
				}
			}
		}),
		prisma.analyticsEvent.findMany({
			where: {
				type: 'numbers_service_open',
				path: { startsWith: '/numbers/service/' },
				createdAt: { gte: demandSince }
			},
			select: { path: true }
		})
	]);
	const demand30d = summarizeNumbersDemand(
		rentals
			.filter((rental) => rental.createdAt >= demandSince)
			.map((rental) => ({
				serviceId: rental.serviceId,
				serviceName: rental.serviceName,
				status: rental.status
			})),
		serviceOpenEvents
	);
	const attempts = rentals.length
		? await prisma.phoneAttempt.findMany({
				where: {
					orderItemId: { in: rentals.map((r) => r.orderItemId) },
					actualCostCents: { not: null }
				},
				select: { orderItemId: true, actualCostCents: true }
			})
		: [];
	const actualCostByOrderItem = new Map<string, number>();
	for (const attempt of attempts) {
		actualCostByOrderItem.set(
			attempt.orderItemId,
			(actualCostByOrderItem.get(attempt.orderItemId) ?? 0) +
				Math.max(0, attempt.actualCostCents ?? 0)
		);
	}

	const groups = new Map<string, NumbersServiceStat & { _otpSum: number; _otpCount: number }>();
	const overall = { total: 0, received: 0, refunded: 0, inFlight: 0, revenueNgn: 0, costNgn: 0 };

	for (const r of rentals) {
		const key = `${r.serviceName}||${r.countryName}`;
		if (!groups.has(key)) {
			groups.set(key, {
				serviceName: r.serviceName,
				countryName: r.countryName,
				total: 0,
				received: 0,
				refunded: 0,
				inFlight: 0,
				successRatePct: null,
				avgTimeToOtpSec: null,
				revenueNgn: 0,
				costNgn: 0,
				marginNgn: 0,
				needsAttention: false,
				_otpSum: 0,
				_otpCount: 0
			});
		}
		const g = groups.get(key)!;
		g.total += 1;
		overall.total += 1;
		const actualCostCents = actualCostByOrderItem.has(r.orderItemId)
			? actualCostByOrderItem.get(r.orderItemId)!
			: r.status === RECEIVED
				? (r.costCents ?? 0)
				: 0;
		const cost = (actualCostCents / 100) * usdNgnRate;
		g.costNgn += cost;
		overall.costNgn += cost;

		if (r.status === RECEIVED) {
			g.received += 1;
			overall.received += 1;
			const sale = Math.max(
				0,
				Number(r.saleAmountNgn ?? 0) - Number(r.orderItem?.refundedAmount ?? 0)
			);
			g.revenueNgn += sale;
			overall.revenueNgn += sale;
			if (r.receivedAt) {
				g._otpSum += (r.receivedAt.getTime() - r.createdAt.getTime()) / 1000;
				g._otpCount += 1;
			}
		} else if (FAILED_STATES.has(r.status)) {
			g.refunded += 1;
			overall.refunded += 1;
		} else {
			g.inFlight += 1;
			overall.inFlight += 1;
		}
	}

	const byService: NumbersServiceStat[] = [];
	for (const g of groups.values()) {
		const resolved = g.received + g.refunded;
		g.successRatePct = resolved > 0 ? Math.round((g.received / resolved) * 100) : null;
		g.avgTimeToOtpSec = g._otpCount > 0 ? Math.round(g._otpSum / g._otpCount) : null;
		g.marginNgn = g.revenueNgn - g.costNgn;
		// Flag services where >30% of resolved rentals failed (and enough volume to matter).
		g.needsAttention = resolved >= 3 && g.successRatePct != null && g.successRatePct < 70;
		const { _otpSum, _otpCount, ...clean } = g;
		void _otpSum;
		void _otpCount;
		byService.push(clean);
	}
	byService.sort((a, b) => b.total - a.total);

	const resolvedOverall = overall.received + overall.refunded;
	return {
		overall: {
			...overall,
			successRatePct:
				resolvedOverall > 0 ? Math.round((overall.received / resolvedOverall) * 100) : null,
			marginNgn: overall.revenueNgn - overall.costNgn
		},
		byService,
		demand30d,
		recent: rentals.slice(0, 25).map((r) => {
			const u = r.orderItem?.order?.user ?? null;
			return {
				createdAt: r.createdAt.toISOString(),
				serviceName: r.serviceName,
				countryName: r.countryName,
				phoneNumber: r.phoneNumber,
				status: r.status,
				provider: r.provider,
				saleNgn: Math.max(
					0,
					Number(r.saleAmountNgn ?? 0) - Number(r.orderItem?.refundedAmount ?? 0)
				),
				costUsd: actualCostByOrderItem.has(r.orderItemId)
					? actualCostByOrderItem.get(r.orderItemId)! / 100
					: r.costCents != null
						? r.costCents / 100
						: null,
				buyer: u ? u.fullName?.trim() || u.email : null,
				buyerUserId: u?.id ?? null
			};
		})
	};
}

export interface NumbersDashboardSummary {
	totalRents: number;
	receivedRents: number;
	inFlightRents: number;
	successRatePct: number | null;
	revenueNgn: number;
	marginNgn: number;
	hubBalanceCents: number | null;
	lowBalance: boolean;
}

/** Compact headline stats for the main admin dashboard. Best-effort (never throws). */
export async function getNumbersDashboardSummary(): Promise<NumbersDashboardSummary> {
	try {
		const analytics = await getNumbersAnalytics();
		const pricing = await getPhonePricingConfig();
		let hubBalanceCents: number | null = null;
		if (isHubmanConfigured()) hubBalanceCents = await getBalanceCents().catch(() => null);
		return {
			totalRents: analytics.overall.total,
			receivedRents: analytics.overall.received,
			inFlightRents: analytics.overall.inFlight,
			successRatePct: analytics.overall.successRatePct,
			revenueNgn: analytics.overall.revenueNgn,
			marginNgn: analytics.overall.marginNgn,
			hubBalanceCents,
			lowBalance: hubBalanceCents != null && hubBalanceCents < pricing.lowBalanceThresholdCents
		};
	} catch {
		return {
			totalRents: 0,
			receivedRents: 0,
			inFlightRents: 0,
			successRatePct: null,
			revenueNgn: 0,
			marginNgn: 0,
			hubBalanceCents: null,
			lowBalance: false
		};
	}
}
