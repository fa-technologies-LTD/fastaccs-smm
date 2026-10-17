/**
 * Super profit commissions are shown to the affiliate as one line per week (all her friends
 * together), never per order. Totals stay exact to the naira; individual order amounts, costs and
 * profits are never shown, so no single order's or product's margin can be worked out.
 */

export const SUPER_COMMISSION_REFERENCE_PREFIX = 'super:commission:order:';

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // WAT, UTC+1 all year

export function isSuperCommissionReference(reference: string | null | undefined): boolean {
	return typeof reference === 'string' && reference.startsWith(SUPER_COMMISSION_REFERENCE_PREFIX);
}

/** Monday 00:00 WAT of the week containing `at`. */
export function lagosWeekStart(at: Date): Date {
	const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
	const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
	const mondayUtc = Date.UTC(
		shifted.getUTCFullYear(),
		shifted.getUTCMonth(),
		shifted.getUTCDate() - daysSinceMonday
	);
	return new Date(mondayUtc - LAGOS_OFFSET_MS);
}

export interface WeeklyCommissionRow {
	amount: number;
	status: string;
	createdAt: Date;
	buyerUserId: string | null;
}

export interface WeeklyCommissionGroup {
	weekStart: Date;
	status: string;
	amount: number;
	orders: number;
	friends: number;
	latestAt: Date;
}

export function groupWeeklyCommissions(
	rows: ReadonlyArray<WeeklyCommissionRow>
): WeeklyCommissionGroup[] {
	const groups = new Map<
		string,
		{
			weekStart: Date;
			status: string;
			amount: number;
			orders: number;
			friends: Set<string>;
			latestAt: Date;
		}
	>();
	for (const row of rows) {
		const weekStart = lagosWeekStart(row.createdAt);
		const status = String(row.status || '').toLowerCase();
		const key = `${weekStart.toISOString()}|${status}`;
		const group = groups.get(key) ?? {
			weekStart,
			status,
			amount: 0,
			orders: 0,
			friends: new Set<string>(),
			latestAt: row.createdAt
		};
		group.amount += Math.max(0, Number(row.amount) || 0);
		group.orders += 1;
		if (row.buyerUserId) group.friends.add(row.buyerUserId);
		if (row.createdAt > group.latestAt) group.latestAt = row.createdAt;
		groups.set(key, group);
	}
	return [...groups.values()]
		.map((group) => ({
			weekStart: group.weekStart,
			status: group.status,
			amount: Math.round(group.amount * 100) / 100,
			orders: group.orders,
			friends: group.friends.size,
			latestAt: group.latestAt
		}))
		.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}

export function formatWeekOf(weekStart: Date): string {
	return weekStart.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'Africa/Lagos'
	});
}

/** e.g. "Order earnings · week of 13 Oct · 7 orders from 4 friends" */
export function weeklyCommissionTitle(
	group: Pick<WeeklyCommissionGroup, 'weekStart' | 'orders' | 'friends'>
): string {
	const orders = `${group.orders} order${group.orders === 1 ? '' : 's'}`;
	const friends =
		group.friends > 0 ? ` from ${group.friends} friend${group.friends === 1 ? '' : 's'}` : '';
	return `Order earnings · week of ${formatWeekOf(group.weekStart)} · ${orders}${friends}`;
}
