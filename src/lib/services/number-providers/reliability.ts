import { prisma } from '$lib/prisma';
import { decodePvapinsRef } from './pvapins-provider';

/**
 * Learned OTP-delivery reliability per candidate supplier, from our OWN attempt outcomes. A "candidate" is a
 * specific supplier: a pvapins app-variant (Whatsapp24, Whatsapp46 …) or a hub-man service. This
 * is the signal the selector ranks on — bad suppliers sink automatically, good ones rise, with
 * zero manual judgement.
 */

export interface ReliabilityStat {
	received: number;
	total: number;
	reliability: number; // received / total, 0..1
}

export const RESOLVED_ATTEMPT_OUTCOMES = ['otp_received', 'otp_timeout'];

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

/** Load recent per-supplier OTP reliability from resolved PhoneAttempt rows.
 *
 * Rent-time OOS, rate limits, mapping errors, unresolved holds, and order-level refunds are not
 * delivery failures. Only a number that actually received an OTP or authoritatively timed out is
 * eligible. This keeps routing provider-neutral and prevents the old race refunds from poisoning
 * pvapins' score merely because it happened to be the last provider stored on an order.
 */
export async function loadCandidateReliability(windowDays = 14): Promise<Map<string, ReliabilityStat>> {
	try {
		const since = new Date(Date.now() - windowDays * 86_400_000);
		const rows = await prisma.phoneAttempt.findMany({
			where: {
				outcome: { in: RESOLVED_ATTEMPT_OUTCOMES },
				createdAt: { gte: since }
			},
			select: { provider: true, providerServiceRef: true, outcome: true }
		});
		return summarizeReliability(
			rows.map((r) => ({
				key: `${r.provider}:${r.providerServiceRef}`,
				received: r.outcome === 'otp_received'
			}))
		);
	} catch {
		return new Map();
	}
}
