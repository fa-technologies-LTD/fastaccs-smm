import { prisma } from '$lib/prisma';
import { NUMBERS_CLEAN_EPOCH } from '../phone-pricing';
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
	/** Consecutive authoritative no-code outcomes, reset by a delivered OTP. */
	consecutiveFailures?: number;
	/** When the newest OTP success/timeout was resolved. */
	lastResolvedAt?: Date | null;
	/** Consecutive rent-time out-of-stock responses, reset by a successful rent. */
	consecutiveOos?: number;
	/** When the newest rent/OOS attempt was made. */
	lastAttemptAt?: Date | null;
}

export type RouteProtectionState = 'normal' | 'deprioritized' | 'blocked' | 'probation';

// Low-volume safety: two real no-code outcomes are enough to move an exact route to the back.
// A third opens the circuit completely. Time may later allow a cautious canary, but it never
// restores the route's priority: only a delivered OTP resets the failure streak to normal.
export const ROUTE_DEPRIORITIZE_FAILURE_STREAK = 2;
export const ROUTE_BLOCK_FAILURE_STREAK = 3;
export const ROUTE_DEPRIORITIZE_MS = 24 * 60 * 60 * 1000;
export const ROUTE_BLOCK_MS = 72 * 60 * 60 * 1000;
// PVAPins lists variants without live per-variant stock. Stop repeatedly hammering a dry listing;
// after the cooldown it gets one new chance and a successful rent clears the streak.
export const ROUTE_OOS_BLOCK_STREAK = 2;
export const ROUTE_OOS_BLOCK_MS = 2 * 60 * 60 * 1000;

/** Delivery evidence shared by variants serving the same provider/service/country market. */
export function serviceCountryReliabilityKey(
	provider: string,
	serviceId: number,
	countryId: number
): string {
	return `${provider}:market:${serviceId}:${countryId}`;
}

/** Exact provider route inside one service/country market. */
export function exactRouteReliabilityKey(
	provider: string,
	providerServiceRef: string,
	serviceId: number,
	countryId: number
): string {
	return `${provider}:route:${serviceId}:${countryId}:${providerServiceRef}`;
}

export const RESOLVED_ATTEMPT_OUTCOMES = ['otp_received', 'otp_timeout'];
export const ROUTE_HEALTH_ATTEMPT_OUTCOMES = ['otp_received', 'otp_timeout', 'rented', 'oos'];

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
	rows: Array<{ key: string; received: boolean; resolvedAt?: Date | string | null }>
): Map<string, ReliabilityStat> {
	const grouped = new Map<
		string,
		Array<{ received: boolean; resolvedAt: Date | null; sequence: number }>
	>();
	rows.forEach((row, sequence) => {
		const parsed = row.resolvedAt == null ? null : new Date(row.resolvedAt);
		const resolvedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
		const events = grouped.get(row.key) ?? [];
		events.push({ received: row.received, resolvedAt, sequence });
		grouped.set(row.key, events);
	});

	const map = new Map<string, ReliabilityStat>();
	for (const [key, events] of grouped) {
		events.sort((a, b) => {
			if (a.resolvedAt && b.resolvedAt) return a.resolvedAt.getTime() - b.resolvedAt.getTime();
			if (a.resolvedAt) return 1;
			if (b.resolvedAt) return -1;
			return a.sequence - b.sequence;
		});
		let received = 0;
		let consecutiveFailures = 0;
		let lastResolvedAt: Date | null = null;
		for (const event of events) {
			if (event.received) {
				received += 1;
				consecutiveFailures = 0;
			} else {
				consecutiveFailures += 1;
			}
			if (event.resolvedAt) lastResolvedAt = event.resolvedAt;
		}
		map.set(key, {
			received,
			total: events.length,
			reliability: events.length > 0 ? received / events.length : 0,
			consecutiveFailures,
			lastResolvedAt,
			consecutiveOos: 0,
			lastAttemptAt: null
		});
	}
	return map;
}

/** Fold delivery and rent-time availability evidence into exact-route health. */
export function summarizeRouteHealth(
	rows: Array<{
		key: string;
		outcome: string;
		createdAt?: Date | string | null;
		updatedAt?: Date | string | null;
	}>
): Map<string, ReliabilityStat> {
	const map = summarizeReliability(
		rows
			.filter((row) => RESOLVED_ATTEMPT_OUTCOMES.includes(row.outcome))
			.map((row) => ({
				key: row.key,
				received: row.outcome === 'otp_received',
				resolvedAt: row.updatedAt ?? row.createdAt ?? null
			}))
	);
	const grouped = new Map<
		string,
		Array<{ outcome: string; attemptedAt: Date | null; sequence: number }>
	>();
	rows.forEach((row, sequence) => {
		if (!['oos', 'rented', 'otp_received', 'otp_timeout'].includes(row.outcome)) return;
		const parsed = row.createdAt == null ? null : new Date(row.createdAt);
		const attemptedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
		const events = grouped.get(row.key) ?? [];
		events.push({ outcome: row.outcome, attemptedAt, sequence });
		grouped.set(row.key, events);
	});
	for (const [key, events] of grouped) {
		events.sort((a, b) => {
			if (a.attemptedAt && b.attemptedAt) return a.attemptedAt.getTime() - b.attemptedAt.getTime();
			if (a.attemptedAt) return 1;
			if (b.attemptedAt) return -1;
			return a.sequence - b.sequence;
		});
		const stat = map.get(key) ?? {
			received: 0,
			total: 0,
			reliability: 0,
			consecutiveFailures: 0,
			lastResolvedAt: null
		};
		let consecutiveOos = 0;
		let lastAttemptAt: Date | null = null;
		for (const event of events) {
			if (event.outcome === 'oos') consecutiveOos += 1;
			else consecutiveOos = 0; // a rent succeeded, even if its eventual OTP did not
			if (event.attemptedAt) lastAttemptAt = event.attemptedAt;
		}
		map.set(key, { ...stat, consecutiveOos, lastAttemptAt });
	}
	return map;
}

function isWithinCooldown(at: Date | null | undefined, cooldownMs: number, nowMs: number): boolean {
	// Unit callers and legacy stats may lack timestamps. Treat their evidence as current; production
	// attempt rows always provide one.
	if (!at) return true;
	const age = nowMs - at.getTime();
	return age >= 0 && age < cooldownMs;
}

/** Decide whether an exact route may be used now. Aggregate/provider priors must not call this. */
export function routeProtectionState(
	stat: Pick<
		ReliabilityStat,
		'consecutiveFailures' | 'lastResolvedAt' | 'consecutiveOos' | 'lastAttemptAt'
	>,
	now: Date | number = Date.now()
): RouteProtectionState {
	const nowMs = now instanceof Date ? now.getTime() : now;
	const failures = stat.consecutiveFailures ?? 0;
	const oos = stat.consecutiveOos ?? 0;
	if (
		failures >= ROUTE_BLOCK_FAILURE_STREAK &&
		isWithinCooldown(stat.lastResolvedAt, ROUTE_BLOCK_MS, nowMs)
	)
		return 'blocked';
	if (
		oos >= ROUTE_OOS_BLOCK_STREAK &&
		isWithinCooldown(stat.lastAttemptAt, ROUTE_OOS_BLOCK_MS, nowMs)
	)
		return 'blocked';
	if (
		failures >= ROUTE_DEPRIORITIZE_FAILURE_STREAK &&
		isWithinCooldown(stat.lastResolvedAt, ROUTE_DEPRIORITIZE_MS, nowMs)
	)
		return 'deprioritized';
	// A cooldown ending means "eligible for a last-resort canary", not "supplier recovered".
	// Keep previously failed/dry routes at the bottom until a real rent/OTP clears their streak.
	if (failures >= ROUTE_DEPRIORITIZE_FAILURE_STREAK || oos >= ROUTE_OOS_BLOCK_STREAK)
		return 'probation';
	return 'normal';
}

/** Load recent per-supplier OTP reliability from resolved PhoneAttempt rows.
 *
 * Rent-time OOS, rate limits, mapping errors, unresolved holds, and order-level refunds are not
 * delivery failures. Only a number that actually received an OTP or authoritatively timed out is
 * eligible. This keeps routing provider-neutral and prevents the old race refunds from poisoning
 * pvapins' score merely because it happened to be the last provider stored on an order.
 *
 * Reliability rates use the requested rolling window, but exact-route failure/OOS streaks are
 * retained from the clean learning epoch. A route therefore cannot age back into normal priority;
 * only a real successful OTP/rent clears the corresponding streak.
 */
export async function loadCandidateReliability(
	windowDays = 14
): Promise<Map<string, ReliabilityStat>> {
	try {
		const recentSince = new Date(
			Math.max(Date.now() - windowDays * 86_400_000, NUMBERS_CLEAN_EPOCH.getTime())
		);
		const rows = await prisma.phoneAttempt.findMany({
			where: {
				outcome: { in: ROUTE_HEALTH_ATTEMPT_OUTCOMES },
				createdAt: { gte: NUMBERS_CLEAN_EPOCH }
			},
			select: {
				orderItemId: true,
				provider: true,
				providerServiceRef: true,
				outcome: true,
				createdAt: true,
				updatedAt: true
			}
		});
		const rentals = rows.length
			? await prisma.phoneRental.findMany({
					where: { orderItemId: { in: [...new Set(rows.map((row) => row.orderItemId))] } },
					select: { orderItemId: true, serviceId: true, countryId: true }
				})
			: [];
		const marketByOrderItem = new Map(
			rentals.map((rental) => [
				rental.orderItemId,
				{ serviceId: rental.serviceId, countryId: rental.countryId }
			])
		);
		const expandEvidence = (inputRows: typeof rows, exactOnly = false) =>
			inputRows.flatMap((row) => {
				const market = marketByOrderItem.get(row.orderItemId);
				const evidence = {
					outcome: row.outcome,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt
				};
				const exact = market
					? [
							{
								key: exactRouteReliabilityKey(
									row.provider,
									row.providerServiceRef,
									market.serviceId,
									market.countryId
								),
								...evidence
							}
						]
					: [];
				if (exactOnly) return exact;
				return [
					...exact,
					...(row.provider === 'pvapins'
						? [{ key: `${row.provider}:${row.providerServiceRef}`, ...evidence }]
						: []),
					...(market
						? [
								{
									key: serviceCountryReliabilityKey(
										row.provider,
										market.serviceId,
										market.countryId
									),
									...evidence
								}
							]
						: []),
					{ key: `${row.provider}:*`, ...evidence }
				];
			});

		const recentRows = rows.filter((row) => {
			// Prisma always returns createdAt. Treat absent timestamps as recent for legacy callers/tests.
			if (!row.createdAt) return true;
			return new Date(row.createdAt).getTime() >= recentSince.getTime();
		});
		// Exact PVAPins variants choose within a market. Service/country evidence gives a new variant
		// a locally relevant prior, and provider-wide evidence is the final cold-start fallback.
		const recentStats = summarizeRouteHealth(expandEvidence(recentRows));
		const durableExactStats = summarizeRouteHealth(expandEvidence(rows, true));
		for (const [key, durable] of durableExactStats) {
			const recent = recentStats.get(key);
			recentStats.set(key, {
				received: recent?.received ?? 0,
				total: recent?.total ?? 0,
				reliability: recent?.reliability ?? 0,
				consecutiveFailures: durable.consecutiveFailures ?? 0,
				lastResolvedAt: durable.lastResolvedAt ?? null,
				consecutiveOos: durable.consecutiveOos ?? 0,
				lastAttemptAt: durable.lastAttemptAt ?? null
			});
		}
		return recentStats;
	} catch {
		return new Map();
	}
}
