import { describe, it, expect } from 'vitest';
import { rankCandidates, poolFloorCostCents, effectiveReliability, type Candidate } from './selection';

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

describe('poolFloorCostCents', () => {
	it('is the cheapest in-stock cost (for pricing)', () => {
		expect(poolFloorCostCents([c({ costCents: 90 }), c({ costCents: 40 }), c({ costCents: 0, available: 0 })])).toBe(40);
	});
	it('is null when nothing is in stock', () => {
		expect(poolFloorCostCents([c({ available: 0 })])).toBeNull();
	});
});
