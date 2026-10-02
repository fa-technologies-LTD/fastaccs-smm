import { describe, expect, it } from 'vitest';
import {
	buildDraftTierSuggestions,
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

	it('chooses the cheapest service once it meets the tier evidence floor', () => {
		const ranked = rankDraftSuggestionCandidates(
			[
				{
					...candidates[2],
					id: 'cheap-stable',
					ratePerThousand: 1,
					qualitySignals: ['stability_claim']
				},
				{
					...candidates[2],
					id: 'expensive-more-signals',
					ratePerThousand: 20,
					qualitySignals: ['stability_claim', 'refill_claim']
				}
			],
			'stable',
			1
		);

		expect(ranked[0].id).toBe('cheap-stable');
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

	it('uses distinct services and creates a clear cost-safe price ladder', () => {
		const suggestions = buildDraftTierSuggestions({
			candidates,
			minimumQuantity: 100,
			stepQuantity: 100,
			existingPricePerStep: 0,
			fxRate: 1000,
			costBuffer: 1,
			routeLimit: 1
		});

		expect(suggestions.map((suggestion) => suggestion.tier)).toEqual([
			'value',
			'stable',
			'premium'
		]);
		const serviceIds = suggestions.flatMap((suggestion) =>
			suggestion.candidates.map((candidate) => candidate.id)
		);
		expect(new Set(serviceIds).size).toBe(serviceIds.length);
		expect(suggestions[1].pricePerStepNgn).toBeGreaterThanOrEqual(
			suggestions[0].pricePerStepNgn * 1.25
		);
		expect(suggestions[2].pricePerStepNgn).toBeGreaterThanOrEqual(
			suggestions[0].pricePerStepNgn * 1.5
		);
		expect(suggestions[2].pricePerStepNgn).toBeGreaterThan(suggestions[1].pricePerStepNgn);
	});

	it('omits higher tiers when no distinct qualifying service remains', () => {
		const suggestions = buildDraftTierSuggestions({
			candidates: [candidates[3]],
			minimumQuantity: 100,
			stepQuantity: 100,
			existingPricePerStep: 0,
			fxRate: 1000,
			costBuffer: 1
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].tier).toBe('value');
	});

	it('omits a qualifying tier when its supplier cost would create an implausible price jump', () => {
		const suggestions = buildDraftTierSuggestions({
			candidates: [
				candidates[0],
				{
					...candidates[2],
					id: 'extreme-stable',
					ratePerThousand: 100
				}
			],
			minimumQuantity: 100,
			stepQuantity: 100,
			existingPricePerStep: 0,
			fxRate: 1000,
			costBuffer: 1
		});

		expect(suggestions.map((suggestion) => suggestion.tier)).toEqual(['value']);
	});
});
