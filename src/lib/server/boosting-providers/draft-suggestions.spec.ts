import { describe, expect, it } from 'vitest';
import {
	rankDraftSuggestionCandidates,
	suggestDraftPricePerStep,
	type DraftSuggestionCandidate
} from './draft-suggestions';

const candidates: DraftSuggestionCandidate[] = [
	{
		id: 'cheap-a',
		provider: 'smm_raja',
		ratePerThousand: 0.5,
		minQuantity: 100,
		maxQuantity: 100000,
		qualitySignals: []
	},
	{
		id: 'cheap-b',
		provider: 'bulk_follows',
		ratePerThousand: 0.7,
		minQuantity: 100,
		maxQuantity: 100000,
		qualitySignals: []
	},
	{
		id: 'stable-a',
		provider: 'smm_raja',
		ratePerThousand: 1.5,
		minQuantity: 100,
		maxQuantity: 100000,
		qualitySignals: ['stability_claim', 'refill_claim']
	},
	{
		id: 'premium-b',
		provider: 'bulk_follows',
		ratePerThousand: 2,
		minQuantity: 100,
		maxQuantity: 100000,
		qualitySignals: ['quality_claim', 'stability_claim']
	}
];

describe('Boosting draft suggestion ranking', () => {
	it('keeps the affordable shortlist compact and includes both providers', () => {
		const ranked = rankDraftSuggestionCandidates(candidates, 'value', 2);
		expect(ranked.map((candidate) => candidate.provider).sort()).toEqual([
			'bulk_follows',
			'smm_raja'
		]);
	});

	it('does not call an unqualified cheap service stable', () => {
		const ranked = rankDraftSuggestionCandidates(candidates, 'stable');
		expect(ranked.map((candidate) => candidate.id)).not.toContain('cheap-a');
		expect(ranked.map((candidate) => candidate.id)).not.toContain('cheap-b');
	});

	it('uses quality claims only as a premium review signal, not an approval', () => {
		const ranked = rankDraftSuggestionCandidates(candidates, 'premium');
		expect(ranked.map((candidate) => candidate.id)).toEqual(['premium-b']);
	});

	it('suggests a rounded price that preserves the minimum margin', () => {
		expect(
			suggestDraftPricePerStep({
				maximumCostAtMinimum: 700,
				minimumQuantity: 1000,
				stepQuantity: 1000,
				existingPricePerStep: 0,
				priceMultiplier: 1
			})
		).toBe(1000);
	});

	it('does not lower an existing catalogue price and keeps premium visibly distinct', () => {
		expect(
			suggestDraftPricePerStep({
				maximumCostAtMinimum: 100,
				minimumQuantity: 1000,
				stepQuantity: 1000,
				existingPricePerStep: 2000,
				priceMultiplier: 1.5
			})
		).toBe(3000);
	});
});
