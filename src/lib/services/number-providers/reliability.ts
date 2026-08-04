import { prisma } from '$lib/prisma';
import { decodePvapinsRef } from './pvapins-provider';

/**
 * Learned reliability per candidate supplier, from our OWN rental outcomes. A "candidate" is a
 * specific supplier: a pvapins app-variant (Whatsapp24, Whatsapp46 …) or a hub-man service. This
 * is the signal the selector ranks on — bad suppliers sink automatically, good ones rise, with
 * zero manual judgement.
 */

export interface ReliabilityStat {
	received: number;
	total: number;
	reliability: number; // received / total, 0..1
}

// A resolved rental reached one of these terminal states (so its outcome is known).
export const RESOLVED_STATUSES = ['received', 'refunded', 'expired', 'failed', 'cancelled'];
const RECEIVED = 'received';

/** Stable key identifying the supplier behind a rental (pvapins app, or hub-man service id). */
export function candidateKeyFromRental(r: {
	provider: string;
	providerRef: string | null;
	serviceId: number;
}): string {
	if (r.provider === 'pvapins' && r.providerRef) {
		return `pvapins:${decodePvapinsRef(r.providerRef).app}`;
	}
	return `hubman:${r.serviceId}`;
}

/** Pure: fold resolved rentals into per-supplier success rates. */
export function summarizeReliability(
	rows: Array<{ key: string; received: boolean }>
): Map<string, ReliabilityStat> {
	const map = new Map<string, ReliabilityStat>();
	for (const row of rows) {
		const stat = map.get(row.key) ?? { received: 0, total: 0, reliability: 0 };
		stat.total += 1;
		if (row.received) stat.received += 1;
		map.set(row.key, stat);
	}
	for (const stat of map.values()) {
		stat.reliability = stat.total > 0 ? stat.received / stat.total : 0;
	}
	return map;
}

/** Load recent per-supplier reliability from PhoneRental (best-effort; empty map on error). */
export async function loadCandidateReliability(windowDays = 14): Promise<Map<string, ReliabilityStat>> {
	try {
		const since = new Date(Date.now() - windowDays * 86_400_000);
		const rows = await prisma.phoneRental.findMany({
			where: { status: { in: RESOLVED_STATUSES }, createdAt: { gte: since } },
			select: { provider: true, providerRef: true, serviceId: true, status: true }
		});
		return summarizeReliability(
			rows.map((r) => ({ key: candidateKeyFromRental(r), received: r.status === RECEIVED }))
		);
	} catch {
		return new Map();
	}
}
