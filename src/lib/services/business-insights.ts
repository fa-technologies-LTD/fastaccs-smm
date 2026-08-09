import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';

/**
 * Decision-oriented business insights: when customers buy (timing heatmap) and where we leak
 * money/trust (failures & refunds). Timing is bucketed in the market's local timezone (WAT,
 * UTC+1) so "peak hour" is meaningful, not skewed by UTC.
 */

// Nigeria/WAT. Orders store UTC; shift then read UTC getters for a stable local day/hour.
const DEFAULT_TZ_OFFSET_HOURS = 1;

/** Local day-of-week (0=Sun) and hour (0–23) for a UTC timestamp at a given tz offset. */
export function localDayHour(date: Date, tzOffsetHours = DEFAULT_TZ_OFFSET_HOURS): {
	day: number;
	hour: number;
} {
	const shifted = new Date(date.getTime() + tzOffsetHours * 3_600_000);
	return { day: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface SalesHeatmap {
	grid: number[][]; // grid[day 0-6][hour 0-23] = order count
	maxCell: number;
	totalOrders: number;
	byHour: number[]; // 24
	peak: { label: string; count: number } | null;
	windowDays: number;
}

export async function getSalesHeatmap(windowDays = 90): Promise<SalesHeatmap> {
	const since = new Date(Date.now() - windowDays * 86_400_000);
	const orders = await prisma.order.findMany({
		where: { AND: [buildRevenueOrderWhere(), { createdAt: { gte: since } }] },
		select: { createdAt: true }
	});

	const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
	const byHour = new Array(24).fill(0);
	let maxCell = 0;
	let peak: { label: string; count: number } | null = null;

	for (const o of orders) {
		const { day, hour } = localDayHour(o.createdAt);
		grid[day][hour] += 1;
		byHour[hour] += 1;
		if (grid[day][hour] > maxCell) {
			maxCell = grid[day][hour];
			peak = { label: `${DAY_LABELS[day]} ${formatHour(hour)}`, count: maxCell };
		}
	}

	return { grid, maxCell, totalOrders: orders.length, byHour, peak, windowDays };
}

function formatHour(h: number): string {
	const period = h < 12 ? 'am' : 'pm';
	const hr = h % 12 === 0 ? 12 : h % 12;
	return `${hr}${period}`;
}

// ---- Leak-finder: where money/trust drains ----------------------------------------------------

export interface LeakAnalysis {
	windowDays: number;
	payments: {
		attempts: number;
		failed: number;
		failedPct: number;
		byReason: Array<{ reason: string; count: number }>;
	};
	numbers: {
		resolved: number;
		received: number;
		successPct: number;
		worst: Array<{ label: string; successPct: number; total: number }>;
	};
	refunds: {
		orders: number;
		refunded: number;
		cancelled: number;
		refundedPct: number;
		byType: Array<{ type: string; refunded: number; cancelled: number }>;
	};
}

const NUMBERS_RESOLVED = ['received', 'refunded', 'expired', 'failed', 'cancelled'];
const MIN_SAMPLE = 5;

export async function getLeakAnalysis(windowDays = 90): Promise<LeakAnalysis> {
	const since = new Date(Date.now() - windowDays * 86_400_000);

	const [orders, rentals] = await Promise.all([
		prisma.order.findMany({
			where: { createdAt: { gte: since } },
			select: {
				status: true,
				paymentStatus: true,
				orderType: true,
				cancellationReason: true
			}
		}),
		prisma.phoneRental.findMany({
			where: { createdAt: { gte: since }, status: { in: NUMBERS_RESOLVED } },
			select: { status: true, serviceName: true, countryName: true }
		})
	]);

	// Payment failures.
	const FAILED = new Set(['failed', 'rejected', 'reversed']);
	const attempts = orders.length;
	const failedOrders = orders.filter((o) => FAILED.has((o.paymentStatus || '').toLowerCase()));
	const reasonAgg = new Map<string, number>();
	for (const o of failedOrders) {
		const r = (o.cancellationReason || 'unknown').trim() || 'unknown';
		reasonAgg.set(r, (reasonAgg.get(r) ?? 0) + 1);
	}
	const payments = {
		attempts,
		failed: failedOrders.length,
		failedPct: attempts ? Math.round((failedOrders.length / attempts) * 1000) / 10 : 0,
		byReason: [...reasonAgg.entries()]
			.map(([reason, count]) => ({ reason, count }))
			.sort((a, b) => b.count - a.count)
	};

	// Numbers delivery health, worst service×country combos.
	const combo = new Map<string, { received: number; total: number }>();
	let received = 0;
	for (const r of rentals) {
		if (r.status === 'received') received += 1;
		const key = `${r.serviceName} — ${r.countryName}`;
		const c = combo.get(key) ?? { received: 0, total: 0 };
		c.total += 1;
		if (r.status === 'received') c.received += 1;
		combo.set(key, c);
	}
	const worst = [...combo.entries()]
		.filter(([, c]) => c.total >= MIN_SAMPLE)
		.map(([label, c]) => ({ label, successPct: Math.round((c.received / c.total) * 100), total: c.total }))
		.sort((a, b) => a.successPct - b.successPct)
		.slice(0, 6);
	const numbers = {
		resolved: rentals.length,
		received,
		successPct: rentals.length ? Math.round((received / rentals.length) * 100) : 0,
		worst
	};

	// Refund / cancellation concentration by product.
	const typeAgg = new Map<string, { refunded: number; cancelled: number }>();
	let refunded = 0;
	let cancelled = 0;
	for (const o of orders) {
		const s = (o.status || '').toLowerCase();
		const t = o.orderType === 'phone' ? 'Numbers' : o.orderType === 'boosting' ? 'Boosting' : 'Accounts';
		const a = typeAgg.get(t) ?? { refunded: 0, cancelled: 0 };
		if (s === 'refunded') {
			a.refunded += 1;
			refunded += 1;
		} else if (s === 'cancelled' || s === 'canceled') {
			a.cancelled += 1;
			cancelled += 1;
		}
		typeAgg.set(t, a);
	}
	const refunds = {
		orders: attempts,
		refunded,
		cancelled,
		refundedPct: attempts ? Math.round((refunded / attempts) * 1000) / 10 : 0,
		byType: [...typeAgg.entries()]
			.map(([type, a]) => ({ type, refunded: a.refunded, cancelled: a.cancelled }))
			.filter((r) => r.refunded > 0 || r.cancelled > 0)
			.sort((a, b) => b.refunded + b.cancelled - (a.refunded + a.cancelled))
	};

	return { windowDays, payments, numbers, refunds };
}
