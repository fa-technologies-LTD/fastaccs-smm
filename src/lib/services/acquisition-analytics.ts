import { prisma } from '$lib/prisma';

/**
 * "Signups & revenue by source" — joins each user's first-touch acquisition source to their
 * paid orders, so the admin can see which channel actually drives revenue (not just visits).
 * Users who signed up before attribution existed (or arrived unattributed) roll into 'untracked'.
 */

export interface SourceStat {
	source: string;
	signups: number;
	buyers: number; // signups with ≥1 paid order
	revenueNgn: number;
	convPct: number; // buyers / signups
}

export interface AcquisitionBreakdown {
	rows: SourceStat[];
	totalSignups: number;
	attributedSignups: number; // signups with a real (non-untracked) source
	windowDays: number;
}

function normalizeSource(s: string | null | undefined): string {
	const v = (s ?? '').trim().toLowerCase();
	return v || 'untracked';
}

export async function getAcquisitionBreakdown(windowDays = 90): Promise<AcquisitionBreakdown> {
	const since = new Date(Date.now() - windowDays * 86_400_000);

	const [users, paidOrders] = await Promise.all([
		prisma.user.findMany({
			where: { registeredAt: { gte: since } },
			select: { id: true, acquisitionSource: true }
		}),
		prisma.order.findMany({
			where: {
				createdAt: { gte: since },
				OR: [
					{ paymentStatus: { in: ['paid', 'success'] } },
					{ status: { in: ['completed', 'delivered', 'processing'] } }
				]
			},
			select: { userId: true, totalAmount: true }
		})
	]);

	const sourceByUser = new Map<string, string>();
	const stats = new Map<string, SourceStat>();
	const ensure = (s: string): SourceStat => {
		let row = stats.get(s);
		if (!row) {
			row = { source: s, signups: 0, buyers: 0, revenueNgn: 0, convPct: 0 };
			stats.set(s, row);
		}
		return row;
	};

	for (const u of users) {
		const s = normalizeSource(u.acquisitionSource);
		sourceByUser.set(u.id, s);
		ensure(s).signups += 1;
	}

	const countedBuyers = new Set<string>();
	for (const o of paidOrders) {
		if (!o.userId) continue;
		const s = sourceByUser.get(o.userId);
		if (!s) continue; // order by a user who signed up outside the window — don't misattribute
		const row = ensure(s);
		row.revenueNgn += Number(o.totalAmount || 0);
		const key = `${s}:${o.userId}`;
		if (!countedBuyers.has(key)) {
			countedBuyers.add(key);
			row.buyers += 1;
		}
	}

	const rows = [...stats.values()]
		.map((r) => ({ ...r, convPct: r.signups > 0 ? (r.buyers / r.signups) * 100 : 0 }))
		.sort((a, b) => b.revenueNgn - a.revenueNgn || b.signups - a.signups);

	const totalSignups = users.length;
	const attributedSignups = totalSignups - (stats.get('untracked')?.signups ?? 0);

	return { rows, totalSignups, attributedSignups, windowDays };
}
