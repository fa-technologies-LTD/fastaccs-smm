import { prisma } from '$lib/prisma';
import { getPhonePricingConfig, NUMBERS_CLEAN_EPOCH } from './phone-pricing';
import { getBalanceCents, isHubmanConfigured } from './hubman';
import {
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

// Only recent evidence counts. Exact-route cooldowns decide when a cautious canary is allowed.
export const SUCCESS_HIDE_WINDOW_DAYS = 14;

/**
 * Tiers to mute for either of two customer-safety reasons:
 * - the product itself has two consecutive failed customer orders (three extends the cooldown), or
 * - every exact supplier route with real evidence is currently protected.
 *
 * The product-level streak catches failures spread across several supplier variants—the real 0/7
 * pattern that an exact-route-only breaker misses. One successful customer order resets it. A
 * completely new tier with no evidence still gets a controlled first chance.
 */
export async function getLowSuccessTierKeys(): Promise<Set<string>> {
	const since = new Date(Date.now() - SUCCESS_HIDE_WINDOW_DAYS * 86_400_000);
	const rentals = await prisma.phoneRental.findMany({
		where: { createdAt: { gte: since } },
		select: {
			orderItemId: true,
			serviceName: true,
			countryName: true,
			status: true,
			createdAt: true,
			receivedAt: true,
			refundedAt: true,
			updatedAt: true
		}
	});
	if (rentals.length === 0) return new Set();
	const tierByOrderItem = new Map(
		rentals.map((r) => [r.orderItemId, `${r.serviceName}||${r.countryName}`])
	);
	const attempts = await prisma.phoneAttempt.findMany({
		where: {
			orderItemId: { in: [...tierByOrderItem.keys()] },
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
		const tierKey = tierByOrderItem.get(attempt.orderItemId);
		if (!tierKey) return [];
		const routeKey = JSON.stringify([
			tierKey,
			attempt.provider || 'unknown',
			attempt.providerServiceRef
		]);
		tierByRoute.set(routeKey, tierKey);
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
	const routesByTier = new Map<string, ReliabilityStat[]>();
	for (const [routeKey, stat] of routeStats) {
		const tierKey = tierByRoute.get(routeKey);
		if (!tierKey) continue;
		const routes = routesByTier.get(tierKey) ?? [];
		routes.push(stat);
		routesByTier.set(tierKey, routes);
	}
	const out = new Set<string>();
	const resolvedByTier = new Map<
		string,
		Array<{ received: boolean; createdAt: Date; resolvedAt: Date }>
	>();
	for (const rental of rentals) {
		const received = rental.status === RECEIVED;
		if (!received && !FAILED_STATES.has(rental.status)) continue;
		const tierKey = `${rental.serviceName}||${rental.countryName}`;
		const rows = resolvedByTier.get(tierKey) ?? [];
		rows.push({
			received,
			createdAt: rental.createdAt,
			resolvedAt: rental.receivedAt ?? rental.refundedAt ?? rental.updatedAt
		});
		resolvedByTier.set(tierKey, rows);
	}
	for (const [tierKey, rows] of resolvedByTier) {
		rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		let consecutiveFailures = 0;
		let lastResolvedAt: Date | null = null;
		for (const row of rows) {
			consecutiveFailures = row.received ? 0 : consecutiveFailures + 1;
			lastResolvedAt = row.resolvedAt;
		}
		if (routeProtectionState({ consecutiveFailures, lastResolvedAt }) !== 'normal') {
			out.add(tierKey);
		}
	}
	for (const [tierKey, routes] of routesByTier) {
		if (routes.length > 0 && routes.every((route) => routeProtectionState(route) !== 'normal')) {
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
