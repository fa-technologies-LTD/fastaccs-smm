import { describe, expect, it } from 'vitest';
import type { BoostMappingCandidate } from '$lib/helpers/boosting-mapping-types';
import { rankSmartBoostCandidates } from './setup-service';

function candidate(input: Partial<BoostMappingCandidate> & Pick<BoostMappingCandidate, 'id' | 'provider' | 'ratePerThousand'>): BoostMappingCandidate {
	return {
		providerLabel: input.provider,
		serviceId: input.id,
		name: input.id,
		category: 'X',
		providerType: null,
		minQuantity: 10,
		maxQuantity: 10000,
		refillAdvertised: false,
		refillDaysClaimed: null,
		cancelAdvertised: false,
		dripfeedAdvertised: false,
		qualitySignals: [],
		catalogueStatus: 'ready_for_review',
		lastSeenAt: new Date(0).toISOString(),
		mappedRoute: null,
		...input
	};
}

describe('Smart Auto shortlist', () => {
	it('keeps both suppliers represented before filling the remaining slots', () => {
		const result = rankSmartBoostCandidates([
			candidate({ id: 'a', provider: 'smm_raja', ratePerThousand: 1 }),
			candidate({ id: 'b', provider: 'smm_raja', ratePerThousand: 2 }),
			candidate({ id: 'c', provider: 'bulk_follows', ratePerThousand: 3 })
		], 'value', 3);
		expect(result.map((row) => row.id)).toEqual(['a', 'c', 'b']);
	});

	it('prioritizes advertised quality and refill signals for premium', () => {
		const result = rankSmartBoostCandidates([
			candidate({ id: 'cheap', provider: 'smm_raja', ratePerThousand: 1 }),
			candidate({
				id: 'premium',
				provider: 'smm_raja',
				ratePerThousand: 5,
				refillAdvertised: true,
				qualitySignals: ['quality_claim', 'stability_claim']
			}),
			candidate({ id: 'other', provider: 'bulk_follows', ratePerThousand: 2 })
		], 'premium', 3);
		expect(result[0].id).toBe('premium');
	});
});
