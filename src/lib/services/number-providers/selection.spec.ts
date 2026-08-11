import { describe, it, expect } from 'vitest';
import {
	rankCandidates,
	poolFloorCostCents,
	effectiveReliability,
	buildCandidatePool,
	type Candidate
} from './selection';
import type { ReliabilityStat } from './reliability';

const c = (over: Partial<Candidate>): Candidate => ({
	provider: 'pvapins',
	providerServiceRef: 'Whatsapp24',
	providerCountryRef: 'USA',
	label: 'pvapins:Whatsapp24',
	costCents: 66,
	available: 5,
	reliability: null,
	sampleSize: 0,
	...over
});

describe('rankCandidates', () => {
	it('drops out-of-stock candidates entirely', () => {
		const ranked = rankCandidates([c({ label: 'a', available: 0 }), c({ label: 'b', available: 3 })]);
		expect(ranked.map((x) => x.label)).toEqual(['b']);
	});

	it('ranks a proven-reliable candidate above a proven-poor one', () => {
		const good = c({ label: 'good', reliability: 0.95, sampleSize: 20 });
		const bad = c({ label: 'bad', reliability: 0.2, sampleSize: 20, costCents: 10 });
		expect(rankCandidates([bad, good])[0].label).toBe('good');
	});

	it('uses cost as the tiebreaker when reliability is comparable', () => {
		const cheap = c({ label: 'cheap', reliability: 0.9, sampleSize: 20, costCents: 40 });
		const pricey = c({ label: 'pricey', reliability: 0.9, sampleSize: 20, costCents: 90 });
		expect(rankCandidates([pricey, cheap])[0].label).toBe('cheap');
	});

	it('gives unproven candidates a fair shot — below proven-excellent, above proven-poor', () => {
		const excellent = c({ label: 'excellent', reliability: 0.98, sampleSize: 30 });
		const unproven = c({ label: 'unproven', reliability: null, sampleSize: 0 });
		const poor = c({ label: 'poor', reliability: 0.3, sampleSize: 30 });
		expect(rankCandidates([poor, unproven, excellent]).map((x) => x.label)).toEqual([
			'excellent',
			'unproven',
			'poor'
		]);
	});

	it('treats a low-sample measured reliability as cold-start (not yet trusted)', () => {
		// 100% over only 2 rents shouldn't outrank a proven 90% over 30.
		const fewSamples = c({ label: 'lucky2', reliability: 1, sampleSize: 2 });
		const proven = c({ label: 'proven', reliability: 0.9, sampleSize: 30 });
		expect(rankCandidates([fewSamples, proven])[0].label).toBe('proven');
	});

	it('returns empty for an empty pool', () => {
		expect(rankCandidates([])).toEqual([]);
	});

	it('prefers proven-reliable variants (cheapest among them) over cheaper unproven ones (§22)', () => {
		// Two excellent variants ($0.68, $0.74) + a pricier excellent ($1.90) + cheaper unproven ones.
		const ranked = rankCandidates([
			c({ label: 'wa8-0.51-unproven', costCents: 51, reliability: null, sampleSize: 0 }),
			c({ label: 'wa52-1.90-excellent', costCents: 190, reliability: 0.97, sampleSize: 30 }),
			c({ label: 'wa31-0.68-excellent', costCents: 68, reliability: 0.97, sampleSize: 30 }),
			c({ label: 'wa44-0.74-excellent', costCents: 74, reliability: 0.97, sampleSize: 30 })
		]).map((x) => x.label);
		// Excellent band first, cheapest within it → 0.68 then 0.74 then 1.90; unproven last.
		expect(ranked).toEqual([
			'wa31-0.68-excellent',
			'wa44-0.74-excellent',
			'wa52-1.90-excellent',
			'wa8-0.51-unproven'
		]);
	});
});

describe('effectiveReliability', () => {
	it('falls back to the cold-start score below the sample threshold', () => {
		expect(effectiveReliability({ reliability: 1, sampleSize: 3 })).toBe(0.75);
		expect(effectiveReliability({ reliability: null, sampleSize: 0 })).toBe(0.75);
	});
	it('uses the measured value once trusted', () => {
		expect(effectiveReliability({ reliability: 0.9, sampleSize: 20 })).toBe(0.9);
	});
});

describe('buildCandidatePool', () => {
	it('merges hub-man + pvapins, attaches reliability, and ranks by it (bad supplier sinks)', () => {
		const reliability = new Map<string, ReliabilityStat>([
			['pvapins:Whatsapp24', { received: 18, total: 20, reliability: 0.9 }],
			['pvapins:Whatsapp46', { received: 1, total: 20, reliability: 0.05 }],
			['hubman:1', { received: 5, total: 20, reliability: 0.25 }]
		]);
		const pool = buildCandidatePool({
			hub: { serviceRef: '1', countryRef: '58', costCents: 50, available: 3 },
			pvapins: [
				{ app: 'Whatsapp24', countryName: 'USA', costCents: 66, available: 5 },
				{ app: 'Whatsapp46', countryName: 'USA', costCents: 40, available: 5 }
			],
			reliability
		});
		// Whatsapp24 (0.9) first; the rate-limited Whatsapp46 (0.05) last despite being cheapest.
		expect(pool.map((c) => c.label)).toEqual(['pvapins:Whatsapp24', 'hubman:1', 'pvapins:Whatsapp46']);
	});

	it('lists an unproven pvapins supplier ahead of a proven-poor hub-man one', () => {
		const pool = buildCandidatePool({
			hub: { serviceRef: '1', countryRef: '58', costCents: 50, available: 3 },
			pvapins: [{ app: 'Whatsapp99', countryName: 'USA', costCents: 66, available: 5 }],
			reliability: new Map([['hubman:1', { received: 2, total: 20, reliability: 0.1 }]])
		});
		expect(pool[0].label).toBe('pvapins:Whatsapp99');
	});
});

describe('poolFloorCostCents', () => {
	it('is the cheapest in-stock cost (for pricing)', () => {
		expect(poolFloorCostCents([c({ costCents: 90 }), c({ costCents: 40 }), c({ costCents: 0, available: 0 })])).toBe(40);
	});
	it('is null when nothing is in stock', () => {
		expect(poolFloorCostCents([c({ available: 0 })])).toBeNull();
	});
});
