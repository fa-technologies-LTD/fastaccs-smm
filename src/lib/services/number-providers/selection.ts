import type { NumberProviderId } from './types';
import {
	exactRouteReliabilityKey,
	routeProtectionState,
	serviceCountryReliabilityKey,
	type ReliabilityStat
} from './reliability';

/**
 * Candidate-pool selection. A storefront product (service×country) is backed by many candidate
 * suppliers across providers — hub-man plus each pvapins app-variant (Whatsapp24, Whatsapp46 …).
 * We rank them so fulfillment always reaches for the most reliable in-stock option, and walks
 * down the list on failover. Reliability is LEARNED from real outcomes — nobody picks by hand.
 */
export interface Candidate {
	provider: NumberProviderId;
	serviceId: number;
	countryId: number;
	/** How this provider addresses the service/country (hub-man: numeric ids as strings; pvapins: names). */
	providerServiceRef: string;
	providerCountryRef: string;
	/** Human label for admin/analytics, e.g. "pvapins:Whatsapp24". */
	label: string;
	costCents: number;
	/** Live stock; 0 = cannot fulfill right now (filtered out). */
	available: number;
	/** hub-man exposes live stock; PVAPins exposes only a catalogue listing. */
	stockConfidence: 'confirmed' | 'listed';
	/** Observed success rate 0..1 from our own rents, or null when unproven. */
	reliability: number | null;
	/** Number of resolved rents behind `reliability` (drives cold-start handling). */
	sampleSize: number;
	/** Exact-route recent failure streak; aggregate priors never populate these fields. */
	consecutiveFailures?: number;
	lastResolvedAt?: Date | null;
	consecutiveOos?: number;
	lastAttemptAt?: Date | null;
}

// A candidate needs this many resolved rents before we use its measured reliability at full weight.
export const MIN_RELIABILITY_SAMPLE = 8;
// Unproven candidates rank at this score: a fair shot (so new suppliers get tried and measured),
// but below a proven-excellent one and above a proven-poor one.
export const COLD_START_SCORE = 0.75;
// Group near-equal reliabilities so cost can break the tie instead of tiny noise dominating.
const RELIABILITY_BUCKET = 0.05;

/**
 * Bayesian-style cold-start smoothing. Early outcomes influence routing without allowing one lucky
 * success (or one unlucky timeout) to dominate; at the threshold the measured rate has full weight.
 */
export function effectiveReliability(c: Pick<Candidate, 'reliability' | 'sampleSize'>): number {
	if (c.reliability == null || c.sampleSize <= 0) return COLD_START_SCORE;
	const evidence = Math.min(MIN_RELIABILITY_SAMPLE, Math.max(0, c.sampleSize));
	return (
		(c.reliability * evidence + COLD_START_SCORE * (MIN_RELIABILITY_SAMPLE - evidence)) /
		MIN_RELIABILITY_SAMPLE
	);
}

/**
 * Rank a pool into the order fulfillment should try: in-stock only, most reliable first
 * (bucketed), cheapest as the tiebreaker. The first element is the primary pick; the rest are
 * the failover order.
 */
export function rankCandidates(candidates: Candidate[]): Candidate[] {
	return candidates
		.filter((c) => c.available > 0)
		.map((c) => ({
			c,
			protection: routeProtectionState(c),
			bucket: Math.round(effectiveReliability(c) / RELIABILITY_BUCKET),
			stockRank: c.stockConfidence === 'confirmed' ? 1 : 0
		}))
		.filter((row) => row.protection !== 'blocked')
		.sort(
			(a, b) =>
				protectionRank(a.protection) - protectionRank(b.protection) ||
				b.bucket - a.bucket ||
				b.stockRank - a.stockRank ||
				a.c.costCents - b.c.costCents
		)
		.map((x) => x.c);
}

function protectionRank(state: ReturnType<typeof routeProtectionState>): number {
	if (state === 'normal') return 0;
	if (state === 'deprioritized') return 1;
	if (state === 'probation') return 2;
	return 3;
}

/** Cheapest in-stock cost across the pool — used to price the product (cost × margin). */
export function poolFloorCostCents(candidates: Candidate[]): number | null {
	const inStock = candidates.filter((c) => c.available > 0 && c.costCents > 0);
	if (inStock.length === 0) return null;
	return Math.min(...inStock.map((c) => c.costCents));
}

/**
 * Assemble a product's candidate pool from provider-availability inputs, attach each supplier's
 * learned reliability, and return it in fulfillment order (ranked). Pure — the caller fetches the
 * live availability/cost; this stitches in reliability and ranks. `available` for pvapins is
 * "presumed" (pvapins doesn't expose per-app stock), and rent-time failover confirms it.
 */
export function buildCandidatePool(input: {
	serviceId: number;
	countryId: number;
	hub?: { serviceRef: string; countryRef: string; costCents: number; available: number } | null;
	pvapins: Array<{ app: string; countryName: string; costCents: number; available: number }>;
	reliability: Map<string, ReliabilityStat>;
}): Candidate[] {
	const candidates: Candidate[] = [];
	if (input.hub) {
		const exactStat = input.reliability.get(
			exactRouteReliabilityKey('hubman', input.hub.serviceRef, input.serviceId, input.countryId)
		);
		const stat =
			exactStat ??
			input.reliability.get(
				serviceCountryReliabilityKey('hubman', input.serviceId, input.countryId)
			) ??
			input.reliability.get('hubman:*');
		candidates.push({
			provider: 'hubman',
			serviceId: input.serviceId,
			countryId: input.countryId,
			providerServiceRef: input.hub.serviceRef,
			providerCountryRef: input.hub.countryRef,
			label: `hubman:${input.hub.serviceRef}`,
			costCents: input.hub.costCents,
			available: input.hub.available,
			stockConfidence: 'confirmed',
			reliability: stat?.reliability ?? null,
			sampleSize: stat?.total ?? 0,
			consecutiveFailures: exactStat?.consecutiveFailures ?? 0,
			lastResolvedAt: exactStat?.lastResolvedAt ?? null,
			consecutiveOos: exactStat?.consecutiveOos ?? 0,
			lastAttemptAt: exactStat?.lastAttemptAt ?? null
		});
	}
	for (const p of input.pvapins) {
		const exactStat = input.reliability.get(
			exactRouteReliabilityKey('pvapins', p.app, input.serviceId, input.countryId)
		);
		const stat =
			exactStat ??
			input.reliability.get(`pvapins:${p.app}`) ??
			input.reliability.get(
				serviceCountryReliabilityKey('pvapins', input.serviceId, input.countryId)
			) ??
			input.reliability.get('pvapins:*');
		candidates.push({
			provider: 'pvapins',
			serviceId: input.serviceId,
			countryId: input.countryId,
			providerServiceRef: p.app,
			providerCountryRef: p.countryName,
			label: `pvapins:${p.app}`,
			costCents: p.costCents,
			available: p.available,
			stockConfidence: 'listed',
			reliability: stat?.reliability ?? null,
			sampleSize: stat?.total ?? 0,
			consecutiveFailures: exactStat?.consecutiveFailures ?? 0,
			lastResolvedAt: exactStat?.lastResolvedAt ?? null,
			consecutiveOos: exactStat?.consecutiveOos ?? 0,
			lastAttemptAt: exactStat?.lastAttemptAt ?? null
		});
	}
	return rankCandidates(candidates);
}
