import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { toNetSales } from '$lib/helpers/order-revenue';

/**
 * Campaign-level acquisition report: which source + campaign brought signups, buyers and revenue.
 * Uses each user's first-touch attribution (set from utm tags / referrer), so tracked links from
 * the link builder are measurable today. Spend comes later from the spend ledger; until then the
 * admin page lets the owner type spend in to get a cost-per-buyer decision.
 */

export interface CampaignRow {
	source: string;
	medium: string;
	campaign: string;
	signups: number;
	buyers: number;
	repeatBuyers: number;
	orders: number;
	revenueNgn: number;
}

export interface LandingRow {
	landing: string;
	signups: number;
	buyers: number;
	revenueNgn: number;
}

export interface CampaignReport {
	windowDays: number;
	totals: { signups: number; attributedSignups: number; buyers: number; revenueNgn: number };
	campaigns: CampaignRow[];
	landings: LandingRow[];
	topPages: Array<{ path: string; views: number }>;
}

const UNTRACKED = 'untracked';

function clean(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

const REFERRAL_LANDING = /^\/ref\/([^/?#]+)/i;

/**
 * Affiliate links (/ref/CODE) are usually shared on WhatsApp, whose in-app browser sends no
 * referrer, so they arrive as "direct". Credit them to the affiliate channel instead.
 */
export function resolveChannel(user: {
	acquisitionSource: string | null;
	acquisitionMedium: string | null;
	acquisitionCampaign: string | null;
	acquisitionLanding: string | null;
}): { source: string; medium: string; campaign: string } {
	const source = clean(user.acquisitionSource);
	const referral = REFERRAL_LANDING.exec((user.acquisitionLanding ?? '').trim());
	if (referral && (!source || source === 'direct')) {
		return { source: 'affiliate', medium: 'referral-link', campaign: clean(referral[1]) };
	}
	return {
		source: source || UNTRACKED,
		medium: clean(user.acquisitionMedium),
		campaign: clean(user.acquisitionCampaign)
	};
}

export async function getCampaignReport(windowDays = 30): Promise<CampaignReport> {
	const since = new Date(Date.now() - windowDays * 86_400_000);

	const users = await prisma.user.findMany({
		where: { registeredAt: { gte: since } },
		select: {
			id: true,
			acquisitionSource: true,
			acquisitionMedium: true,
			acquisitionCampaign: true,
			acquisitionLanding: true
		}
	});

	const userIds = users.map((user) => user.id);
	const [orders, topPages] = await Promise.all([
		userIds.length > 0
			? prisma.order.findMany({
					where: { AND: [buildRevenueOrderWhere(), { userId: { in: userIds } }] },
					select: { userId: true, totalAmount: true, refundedAmount: true }
				})
			: Promise.resolve([]),
		prisma.$queryRaw<Array<{ path: string; views: number }>>`
			SELECT split_part(path, '?', 1) AS path, count(*)::int AS views
			FROM analytics_events
			WHERE type = 'page_view' AND created_at >= ${since} AND path NOT LIKE '/admin%'
			GROUP BY 1 ORDER BY 2 DESC LIMIT 15`
	]);

	// Per-user spend first, then roll users up into campaigns and landing pages.
	const perUser = new Map<string, { orders: number; revenue: number }>();
	for (const order of orders) {
		if (!order.userId) continue;
		const entry = perUser.get(order.userId) ?? { orders: 0, revenue: 0 };
		entry.orders += 1;
		entry.revenue += toNetSales(order.totalAmount, order.refundedAmount);
		perUser.set(order.userId, entry);
	}

	const campaigns = new Map<string, CampaignRow>();
	const landings = new Map<string, LandingRow>();
	let attributedSignups = 0;
	let buyers = 0;
	let revenueNgn = 0;

	for (const user of users) {
		const { source, medium, campaign } = resolveChannel(user);
		if (source !== UNTRACKED) attributedSignups += 1;
		const key = `${source}\u0000${campaign}`;
		const row = campaigns.get(key) ?? {
			source,
			medium,
			campaign,
			signups: 0,
			buyers: 0,
			repeatBuyers: 0,
			orders: 0,
			revenueNgn: 0
		};
		const spend = perUser.get(user.id);
		row.signups += 1;
		if (spend) {
			row.buyers += 1;
			if (spend.orders >= 2) row.repeatBuyers += 1;
			row.orders += spend.orders;
			row.revenueNgn += spend.revenue;
			buyers += 1;
			revenueNgn += spend.revenue;
		}
		campaigns.set(key, row);

		const landingPath = (user.acquisitionLanding ?? '').trim();
		if (landingPath) {
			const landing = landings.get(landingPath) ?? {
				landing: landingPath,
				signups: 0,
				buyers: 0,
				revenueNgn: 0
			};
			landing.signups += 1;
			if (spend) {
				landing.buyers += 1;
				landing.revenueNgn += spend.revenue;
			}
			landings.set(landingPath, landing);
		}
	}

	const byValue = <T extends { revenueNgn: number; signups: number }>(a: T, b: T) =>
		b.revenueNgn - a.revenueNgn || b.signups - a.signups;

	return {
		windowDays,
		totals: { signups: users.length, attributedSignups, buyers, revenueNgn },
		campaigns: [...campaigns.values()].sort(byValue),
		landings: [...landings.values()].sort(byValue).slice(0, 12),
		topPages: topPages.map((page) => ({ path: page.path, views: Number(page.views) }))
	};
}
