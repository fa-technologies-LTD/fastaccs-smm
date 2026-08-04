import type { NumberProviderId } from './types';
import type { ReliabilityStat } from './reliability';

/**
 * Candidate-pool selection. A storefront product (service×country) is backed by many candidate
 * suppliers across providers — hub-man plus each pvapins app-variant (Whatsapp24, Whatsapp46 …).
 * We rank them so fulfillment always reaches for the most reliable in-stock option, and walks
 * down the list on failover. Reliability is LEARNED from real outcomes — nobody picks by hand.
 */
export interface Candidate {
	provider: NumberProviderId;
	/** How this provider addresses the service/country (hub-man: numeric ids as strings; pvapins: names). */
	providerServiceRef: string;
	providerCountryRef: string;
	/** Human label for admin/analytics, e.g. "pvapins:Whatsapp24". */
	label: string;
	costCents: number;
	/** Live stock; 0 = cannot fulfill right now (filtered out). */
	available: number;
	/** Observed success rate 0..1 from our own rents, or null when unproven. */
	reliability: number | null;
	/** Number of resolved rents behind `reliability` (drives cold-start handling). */
	sampleSize: number;
}

// A candidate needs this many resolved rents before we trust its measured reliability.
export const MIN_RELIABILITY_SAMPLE = 8;
// Unproven candidates rank at this score: a fair shot (so new suppliers get tried and measured),
// but below a proven-excellent one and above a proven-poor one.
export const COLD_START_SCORE = 0.75;
// Group near-equal reliabilities so cost can break the tie instead of tiny noise dominating.
const RELIABILITY_BUCKET = 0.05;

/** The score we actually rank on: measured reliability once trusted, else the cold-start score. */
export function effectiveReliability(c: Pick<Candidate, 'reliability' | 'sampleSize'>): number {
	if (c.reliability == null || c.sampleSize < MIN_RELIABILITY_SAMPLE) return COLD_START_SCORE;
	return c.reliability;
}

/**
 * Rank a pool into the order fulfillment should try: in-stock only, most reliable first
 * (bucketed), cheapest as the tiebreaker. The first element is the primary pick; the rest are
 * the failover order.
 */
export function rankCandidates(candidates: Candidate[]): Candidate[] {
	return candidates
		.filter((c) => c.available > 0)
		.map((c) => ({ c, bucket: Math.round(effectiveReliability(c) / RELIABILITY_BUCKET) }))
		.sort((a, b) => b.bucket - a.bucket || a.c.costCents - b.c.costCents)
		.map((x) => x.c);
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
	hub?: { serviceRef: string; countryRef: string; costCents: number; available: number } | null;
	pvapins: Array<{ app: string; countryName: string; costCents: number; available: number }>;
	reliability: Map<string, ReliabilityStat>;
}): Candidate[] {
	const candidates: Candidate[] = [];
	if (input.hub) {
		const stat = input.reliability.get(`hubman:${input.hub.serviceRef}`);
		candidates.push({
			provider: 'hubman',
			providerServiceRef: input.hub.serviceRef,
			providerCountryRef: input.hub.countryRef,
			label: `hubman:${input.hub.serviceRef}`,
			costCents: input.hub.costCents,
			available: input.hub.available,
			reliability: stat?.reliability ?? null,
			sampleSize: stat?.total ?? 0
		});
	}
	for (const p of input.pvapins) {
		const stat = input.reliability.get(`pvapins:${p.app}`);
		candidates.push({
			provider: 'pvapins',
			providerServiceRef: p.app,
			providerCountryRef: p.countryName,
			label: `pvapins:${p.app}`,
			costCents: p.costCents,
			available: p.available,
			reliability: stat?.reliability ?? null,
			sampleSize: stat?.total ?? 0
		});
	}
	return rankCandidates(candidates);
}
