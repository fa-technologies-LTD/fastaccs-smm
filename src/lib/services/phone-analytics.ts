import { prisma } from '$lib/prisma';
import { getPhonePricingConfig } from './phone-pricing';
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

/**
 * The set of `serviceName||countryName` tiers whose recent delivery is poor enough to pull
 * from the storefront. Keyed to match the catalog sync's tier key. Cheap: one grouped read.
 */
export async function getLowSuccessTierKeys(): Promise<Set<string>> {
	const rentals = await prisma.phoneRental.findMany({
		select: { serviceName: true, countryName: true, status: true }
	});
	const agg = new Map<string, { received: number; resolved: number }>();
	for (const r of rentals) {
		const key = `${r.serviceName}||${r.countryName}`;
		if (!agg.has(key)) agg.set(key, { received: 0, resolved: 0 });
		const a = agg.get(key)!;
		if (r.status === RECEIVED) {
			a.received += 1;
			a.resolved += 1;
		} else if (FAILED_STATES.has(r.status)) {
			a.resolved += 1;
		}
	}
	const out = new Set<string>();
	for (const [key, a] of agg) {
		if (a.resolved >= SUCCESS_HIDE_MIN_SAMPLE && (a.received / a.resolved) * 100 < SUCCESS_HIDE_THRESHOLD_PCT)
			out.add(key);
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
	recent: Array<{
		createdAt: string;
		serviceName: string;
		countryName: string;
		phoneNumber: string | null;
		status: string;
		saleNgn: number;
		costUsd: number | null;
		buyer: string | null;
		buyerUserId: string | null;
	}>;
}

export async function getNumbersAnalytics(): Promise<NumbersAnalytics> {
	const { usdNgnRate } = await getPhonePricingConfig();
	const rentals = await prisma.phoneRental.findMany({
		orderBy: { createdAt: 'desc' },
		include: {
			orderItem: {
				select: { order: { select: { user: { select: { id: true, email: true, fullName: true } } } } }
			}
		}
	});

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

		if (r.status === RECEIVED) {
			g.received += 1;
			overall.received += 1;
			const sale = Number(r.saleAmountNgn ?? 0);
			const cost = ((r.costCents ?? 0) / 100) * usdNgnRate;
			g.revenueNgn += sale;
			g.costNgn += cost;
			overall.revenueNgn += sale;
			overall.costNgn += cost;
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
			successRatePct: resolvedOverall > 0 ? Math.round((overall.received / resolvedOverall) * 100) : null,
			marginNgn: overall.revenueNgn - overall.costNgn
		},
		byService,
		recent: rentals.slice(0, 25).map((r) => {
			const u = r.orderItem?.order?.user ?? null;
			return {
				createdAt: r.createdAt.toISOString(),
				serviceName: r.serviceName,
				countryName: r.countryName,
				phoneNumber: r.phoneNumber,
				status: r.status,
				saleNgn: Number(r.saleAmountNgn ?? 0),
				costUsd: r.costCents != null ? r.costCents / 100 : null,
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
