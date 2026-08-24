import { prisma } from '$lib/prisma';
import { getPhonePricingConfig, NUMBERS_CLEAN_EPOCH } from './phone-pricing';
import { getBalanceCents, isHubmanConfigured } from './hubman';

/**
 * Analytics for the Numbers service — how each hub-man service/country performs and
 * where customers hit problems (no-SMS refunds). Computed from our own PhoneRental
 * records so it needs no extra hub-man calls. Volumes are low; we aggregate in JS.
 */

const RECEIVED = 'received';
const FAILED_STATES = new Set(['refunded', 'expired', 'cancelled', 'failed']);

// Auto-hide a service+country from the storefront once it fails too often, but only after
// enough real attempts that the rate is trustworthy (one unlucky number never hides a tier).
export const SUCCESS_HIDE_THRESHOLD_PCT = 70;
export const SUCCESS_HIDE_MIN_SAMPLE = 10;
// Only recent outcomes count — a bad streak ages out so a tier can recover on its own once the
// supplier situation improves (matches the reliability ranker's window).
export const SUCCESS_HIDE_WINDOW_DAYS = 14;

/**
 * The set of `serviceName||countryName` tiers we should mute on the storefront because delivery
 * is genuinely broken across BOTH suppliers. Keyed to match the catalog sync's tier key.
 *
 * Provider-aware, and deliberately reluctant: with two suppliers, one bad supplier must NEVER
 * hide a tier the other can serve. We tally each provider (hub-man / pvapins) separately over the
 * recent window and classify it:
 *   - BAD      = enough attempts (≥ MIN_SAMPLE) and delivery below the threshold
 *   - GOOD     = enough attempts and delivery at/above the threshold
 *   - UNTESTED = not enough attempts yet — give it a chance (assume it can work)
 * A tier is muted ONLY when at least one provider is proven BAD and NO provider is GOOD or
 * UNTESTED — i.e. there is no working or unproven supplier left to fall back to. Otherwise the
 * tier stays live and the buy-time candidate pool / reliability ranker routes around the bad one.
 */
export async function getLowSuccessTierKeys(): Promise<Set<string>> {
	const since = new Date(Date.now() - SUCCESS_HIDE_WINDOW_DAYS * 86_400_000);
	const rentals = await prisma.phoneRental.findMany({
		where: { createdAt: { gte: since } },
		select: { orderItemId: true, serviceName: true, countryName: true }
	});
	if (rentals.length === 0) return new Set();
	const tierByOrderItem = new Map(
		rentals.map((r) => [r.orderItemId, `${r.serviceName}||${r.countryName}`])
	);
	const attempts = await prisma.phoneAttempt.findMany({
		where: {
			orderItemId: { in: [...tierByOrderItem.keys()] },
			outcome: { in: ['otp_received', 'otp_timeout'] },
			createdAt: { gte: since }
		},
		select: { orderItemId: true, provider: true, outcome: true }
	});
	// tier key -> provider -> tally
	type Tally = { received: number; resolved: number };
	const byTier = new Map<string, Map<string, Tally>>();
	for (const attempt of attempts) {
		const tierKey = tierByOrderItem.get(attempt.orderItemId);
		if (!tierKey) continue;
		const provider = attempt.provider || 'unknown';
		let providers = byTier.get(tierKey);
		if (!providers) byTier.set(tierKey, (providers = new Map()));
		let t = providers.get(provider);
		if (!t) providers.set(provider, (t = { received: 0, resolved: 0 }));
		if (attempt.outcome === 'otp_received') {
			t.received += 1;
			t.resolved += 1;
		} else if (attempt.outcome === 'otp_timeout') {
			t.resolved += 1;
		}
	}
	const out = new Set<string>();
	for (const [tierKey, providers] of byTier) {
		let anyBad = false;
		let anyKeepAlive = false; // a GOOD or UNTESTED provider — a reason to keep the tier live
		for (const provider of ['hubman', 'pvapins']) {
			const t = providers.get(provider);
			if (!t) {
				anyKeepAlive = true; // no resolved attempts for this source: explicitly untested
				continue;
			}
			if (t.resolved < SUCCESS_HIDE_MIN_SAMPLE) {
				anyKeepAlive = true; // untested: unproven, so give it the benefit of the doubt
			} else if ((t.received / t.resolved) * 100 < SUCCESS_HIDE_THRESHOLD_PCT) {
				anyBad = true;
			} else {
				anyKeepAlive = true; // proven-good supplier keeps the whole tier live
			}
		}
		if (anyBad && !anyKeepAlive) out.add(tierKey);
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
