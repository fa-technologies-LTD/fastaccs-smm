import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';

/**
 * Signup & customer-behaviour analytics — the "who are our users and how do they
 * convert" view. Computed from users + paid orders (aggregated in JS; volumes are
 * small). Designed to surface business-driving insights, not just raw counts.
 */

export interface UserAnalytics {
	totalUsers: number;
	newUsers30d: number;
	signupsByDay: { key: string; count: number }[]; // last 30 days
	buyers: number;
	buyerConversionRate: number; // buyers / totalUsers
	repeatBuyers: number;
	repeatRate: number; // repeatBuyers / buyers
	avgOrdersPerBuyer: number;
	avgDaysToFirstPurchase: number | null;
	newRevenue: number; // revenue from each buyer's first order
	returningRevenue: number; // revenue from subsequent orders
	revenueByType: { account: number; numbers: number; boosting: number };
	cohorts: { month: string; signups: number; converted: number; rate: number }[]; // last 6 months
	topCustomers: { userId: string; name: string; orders: number; spent: number }[];
	insights: string[];
}

function dayKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}
function monthKey(d: Date): string {
	return d.toISOString().slice(0, 7);
}

export async function getUserAnalytics(): Promise<UserAnalytics> {
	const now = new Date();
	const start30 = new Date(now.getTime() - 30 * 86_400_000);
	const start6mo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

	const [users, paidOrders] = await Promise.all([
		prisma.user.findMany({
			where: { userType: { in: ['REGISTERED', 'CONVERTED'] } },
			select: { id: true, email: true, fullName: true, createdAt: true }
		}),
		prisma.order.findMany({
			where: { AND: [buildRevenueOrderWhere(), { userId: { not: null } }] },
			select: { userId: true, totalAmount: true, createdAt: true, orderType: true },
			orderBy: { createdAt: 'asc' }
		})
	]);

	const totalUsers = users.length;
	const newUsers30d = users.filter((u) => u.createdAt >= start30).length;

	// Signups by day (last 30d).
	const signupBuckets = new Map<string, number>();
	for (let i = 29; i >= 0; i--) {
		signupBuckets.set(dayKey(new Date(now.getTime() - i * 86_400_000)), 0);
	}
	for (const u of users) {
		if (u.createdAt >= start30) {
			const k = dayKey(u.createdAt);
			if (signupBuckets.has(k)) signupBuckets.set(k, (signupBuckets.get(k) || 0) + 1);
		}
	}
	const signupsByDay = [...signupBuckets.entries()].map(([key, count]) => ({ key, count }));

	// Per-buyer aggregation.
	const byUser = new Map<
		string,
		{ orders: number; spent: number; firstAt: Date; firstSpent: number }
	>();
	const revenueByType = { account: 0, numbers: 0, boosting: 0 };
	let newRevenue = 0;
	let returningRevenue = 0;

	for (const o of paidOrders) {
		const uid = o.userId!;
		const amount = Number(o.totalAmount || 0);
		const type = o.orderType === 'phone' ? 'numbers' : o.orderType === 'boosting' ? 'boosting' : 'account';
		revenueByType[type] += amount;

		const existing = byUser.get(uid);
		if (!existing) {
			byUser.set(uid, { orders: 1, spent: amount, firstAt: o.createdAt, firstSpent: amount });
			newRevenue += amount; // first order per user (orders are asc)
		} else {
			existing.orders += 1;
			existing.spent += amount;
			returningRevenue += amount;
		}
	}

	const buyers = byUser.size;
	const repeatBuyers = [...byUser.values()].filter((b) => b.orders >= 2).length;
	const totalOrdersByBuyers = [...byUser.values()].reduce((s, b) => s + b.orders, 0);

	// Avg days to first purchase (buyers with a known signup date).
	const signupById = new Map(users.map((u) => [u.id, u.createdAt]));
	const ttfpDays: number[] = [];
	for (const [uid, b] of byUser) {
		const signup = signupById.get(uid);
		if (signup) {
			const days = (b.firstAt.getTime() - signup.getTime()) / 86_400_000;
			if (days >= 0) ttfpDays.push(days);
		}
	}
	const avgDaysToFirstPurchase =
		ttfpDays.length > 0 ? Math.round((ttfpDays.reduce((a, b) => a + b, 0) / ttfpDays.length) * 10) / 10 : null;

	// Cohorts (signup month → conversion), last 6 months.
	const cohortMap = new Map<string, { signups: number; converted: number }>();
	for (let i = 0; i < 6; i++) {
		cohortMap.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), { signups: 0, converted: 0 });
	}
	for (const u of users) {
		if (u.createdAt < start6mo) continue;
		const k = monthKey(u.createdAt);
		const c = cohortMap.get(k);
		if (c) {
			c.signups += 1;
			if (byUser.has(u.id)) c.converted += 1;
		}
	}
	const cohorts = [...cohortMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, v]) => ({
			month,
			signups: v.signups,
			converted: v.converted,
			rate: v.signups > 0 ? Math.round((v.converted / v.signups) * 1000) / 10 : 0
		}));

	// Top customers by lifetime spend. Resolve names for the actual top IDs directly (any user
	// type) — the `users` set above is filtered to REGISTERED/CONVERTED, so a guest/other-type
	// spender would otherwise fall through to a wrong "Unknown".
	const topEntries = [...byUser.entries()].sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
	const topNameRows = await prisma.user.findMany({
		where: { id: { in: topEntries.map(([id]) => id) } },
		select: { id: true, fullName: true, email: true }
	});
	const topNameById = new Map(
		topNameRows.map((u) => [u.id, u.fullName?.trim() || u.email || 'Unknown'])
	);
	const topCustomers = topEntries.map(([userId, b]) => ({
		userId,
		name: topNameById.get(userId) || 'Unknown',
		orders: b.orders,
		spent: Math.round(b.spent)
	}));

	const buyerConversionRate = totalUsers > 0 ? Math.round((buyers / totalUsers) * 1000) / 10 : 0;
	const repeatRate = buyers > 0 ? Math.round((repeatBuyers / buyers) * 1000) / 10 : 0;
	const avgOrdersPerBuyer = buyers > 0 ? Math.round((totalOrdersByBuyers / buyers) * 10) / 10 : 0;

	// Business-driving insight callouts.
	const insights: string[] = [];
	const neverBought = totalUsers - buyers;
	if (totalUsers > 0)
		insights.push(
			`${Math.round((neverBought / totalUsers) * 100)}% of signups (${neverBought.toLocaleString()}) have never purchased — a reactivation opportunity.`
		);
	if (buyers > 0)
		insights.push(
			`${repeatRate}% of buyers come back for more (${repeatBuyers.toLocaleString()} repeat customers).`
		);
	if (avgDaysToFirstPurchase != null)
		insights.push(
			avgDaysToFirstPurchase < 1
				? 'Most buyers purchase the same day they sign up — onboarding is converting fast.'
				: `Buyers take ~${avgDaysToFirstPurchase} days on average to make their first purchase.`
		);
	const totalRev = revenueByType.account + revenueByType.numbers + revenueByType.boosting;
	if (totalRev > 0) {
		const returningPct = Math.round((returningRevenue / totalRev) * 100);
		insights.push(`${returningPct}% of revenue comes from returning customers.`);
	}

	return {
		totalUsers,
		newUsers30d,
		signupsByDay,
		buyers,
		buyerConversionRate,
		repeatBuyers,
		repeatRate,
		avgOrdersPerBuyer,
		avgDaysToFirstPurchase,
		newRevenue: Math.round(newRevenue),
		returningRevenue: Math.round(returningRevenue),
		revenueByType: {
			account: Math.round(revenueByType.account),
			numbers: Math.round(revenueByType.numbers),
			boosting: Math.round(revenueByType.boosting)
		},
		cohorts,
		topCustomers,
		insights
	};
}
