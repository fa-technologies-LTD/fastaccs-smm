import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';

/**
 * Customer intelligence: RFM segmentation (who to reward / win back), lifetime value (incl. by the
 * product they entered on), and signup-month cohort retention. All from Orders + Users — no new
 * capture. Built to drive decisions, not decorate a dashboard.
 */

export type RfmSegment = 'VIP' | 'Loyal' | 'New' | 'Casual' | 'At-risk' | 'Churned';
export const RFM_SEGMENTS: RfmSegment[] = ['VIP', 'Loyal', 'New', 'Casual', 'At-risk', 'Churned'];

/** Rule-based RFM bucket (interpretable, robust at modest volume). Evaluated top-down. */
export function rfmSegment(recencyDays: number, frequency: number, topSpender: boolean): RfmSegment {
	if (recencyDays > 180) return 'Churned'; // no purchase in 6 months
	if (frequency >= 3 && recencyDays <= 60) return topSpender ? 'VIP' : 'Loyal';
	if (frequency >= 2 && recencyDays <= 90) return 'Loyal';
	if (frequency <= 2 && recencyDays <= 30) return 'New';
	if (recencyDays > 90) return 'At-risk'; // 90–180 days: was a buyer, going quiet
	return 'Casual';
}

export function monthKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthsBetween(from: Date, to: Date): number {
	return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export interface SegmentStat {
	segment: RfmSegment;
	buyers: number;
	revenueNgn: number;
	avgSpendNgn: number;
}
export interface LtvByFirstProduct {
	product: string;
	buyers: number;
	avgLtvNgn: number;
}
export interface CohortRow {
	cohort: string; // signup month, e.g. "2026-07"
	size: number; // signups that month
	retentionPct: (number | null)[]; // % who ordered in month-offset i (null = not elapsed yet)
}
export interface CustomerAnalytics {
	totalBuyers: number;
	avgLtvNgn: number;
	segments: SegmentStat[];
	ltvByFirstProduct: LtvByFirstProduct[];
	cohorts: CohortRow[];
	cohortMonths: number;
}

const PRODUCT_LABEL: Record<string, string> = {
	account: 'Accounts',
	phone: 'Numbers',
	boosting: 'Boosting'
};

export async function getCustomerAnalytics(cohortMonths = 6): Promise<CustomerAnalytics> {
	const [orders, users] = await Promise.all([
		prisma.order.findMany({
			where: { AND: [buildRevenueOrderWhere(), { userId: { not: null } }] },
			select: { userId: true, totalAmount: true, orderType: true, createdAt: true },
			orderBy: { createdAt: 'asc' }
		}),
		prisma.user.findMany({
			where: { userType: { in: ['REGISTERED', 'CONVERTED'] } },
			select: { id: true, registeredAt: true }
		})
	]);

	const now = new Date();

	// Per-buyer rollup (from revenue orders).
	interface Buyer {
		count: number;
		spend: number;
		first: Date;
		last: Date;
		firstType: string;
	}
	const byUser = new Map<string, Buyer>();
	for (const o of orders) {
		const uid = o.userId as string;
		const amt = Number(o.totalAmount || 0);
		const type = o.orderType || 'account';
		const b = byUser.get(uid);
		if (!b) {
			byUser.set(uid, { count: 1, spend: amt, first: o.createdAt, last: o.createdAt, firstType: type });
		} else {
			b.count += 1;
			b.spend += amt;
			if (o.createdAt < b.first) {
				b.first = o.createdAt;
				b.firstType = type;
			}
			if (o.createdAt > b.last) b.last = o.createdAt;
		}
	}
	const buyers = [...byUser.values()];
	const totalBuyers = buyers.length;
	const totalRevenue = buyers.reduce((s, b) => s + b.spend, 0);
	const avgLtvNgn = totalBuyers ? Math.round(totalRevenue / totalBuyers) : 0;

	// Top-spender threshold = 80th percentile of buyer spend (top 20%).
	const spendsDesc = buyers.map((b) => b.spend).sort((a, b) => b - a);
	const topThreshold = spendsDesc.length
		? (spendsDesc[Math.floor(spendsDesc.length * 0.2)] ?? spendsDesc[0])
		: Infinity;

	// RFM segments.
	const segAgg = new Map<RfmSegment, { buyers: number; revenue: number }>();
	for (const b of buyers) {
		const recency = Math.floor((now.getTime() - b.last.getTime()) / 86_400_000);
		const seg = rfmSegment(recency, b.count, b.spend >= topThreshold && b.count >= 2);
		const a = segAgg.get(seg) ?? { buyers: 0, revenue: 0 };
		a.buyers += 1;
		a.revenue += b.spend;
		segAgg.set(seg, a);
	}
	const segments: SegmentStat[] = RFM_SEGMENTS.map((seg) => {
		const a = segAgg.get(seg) ?? { buyers: 0, revenue: 0 };
		return {
			segment: seg,
			buyers: a.buyers,
			revenueNgn: Math.round(a.revenue),
			avgSpendNgn: a.buyers ? Math.round(a.revenue / a.buyers) : 0
		};
	});

	// LTV by the product a customer FIRST bought on.
	const ltvAgg = new Map<string, { buyers: number; spend: number }>();
	for (const b of buyers) {
		const p = PRODUCT_LABEL[b.firstType] ?? 'Accounts';
		const a = ltvAgg.get(p) ?? { buyers: 0, spend: 0 };
		a.buyers += 1;
		a.spend += b.spend;
		ltvAgg.set(p, a);
	}
	const ltvByFirstProduct: LtvByFirstProduct[] = [...ltvAgg.entries()]
		.map(([product, a]) => ({ product, buyers: a.buyers, avgLtvNgn: Math.round(a.spend / a.buyers) }))
		.sort((x, y) => y.avgLtvNgn - x.avgLtvNgn);

	// Signup-month cohort retention: of everyone who signed up in month M, what % placed a revenue
	// order in the i-th month after signup. Month 0 = activation (bought in their signup month).
	const cohortOf = new Map<string, string>(); // userId -> signup month
	const cohortSize = new Map<string, number>();
	for (const u of users) {
		const ck = monthKey(u.registeredAt);
		cohortOf.set(u.id, ck);
		cohortSize.set(ck, (cohortSize.get(ck) ?? 0) + 1);
	}
	const signupOf = new Map<string, Date>(users.map((u) => [u.id, u.registeredAt]));
	// cohort -> offset -> set of active userIds
	const active = new Map<string, Map<number, Set<string>>>();
	for (const o of orders) {
		const uid = o.userId as string;
		const signup = signupOf.get(uid);
		const ck = cohortOf.get(uid);
		if (!signup || !ck) continue;
		const off = monthsBetween(signup, o.createdAt);
		if (off < 0 || off >= cohortMonths) continue;
		let m = active.get(ck);
		if (!m) {
			m = new Map();
			active.set(ck, m);
		}
		let s = m.get(off);
		if (!s) {
			s = new Set();
			m.set(off, s);
		}
		s.add(uid);
	}
	const cohorts: CohortRow[] = [...cohortSize.entries()]
		.sort((a, b) => (a[0] < b[0] ? -1 : 1))
		.slice(-8)
		.map(([ck, size]) => {
			const cohortStart = new Date(`${ck}-01T00:00:00Z`);
			const elapsed = monthsBetween(cohortStart, now);
			const m = active.get(ck);
			const retentionPct = Array.from({ length: cohortMonths }, (_, i) => {
				if (i > elapsed) return null; // that month hasn't happened yet
				const count = m?.get(i)?.size ?? 0;
				return size ? Math.round((count / size) * 100) : 0;
			});
			return { cohort: ck, size, retentionPct };
		});

	return { totalBuyers, avgLtvNgn, segments, ltvByFirstProduct, cohorts, cohortMonths };
}
