import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { BoostMappingCandidate } from '$lib/helpers/boosting-mapping-types';
import { lookupBoostProviderService, rankSmartBoostCandidates } from './setup-service';

function candidate(
	input: Partial<BoostMappingCandidate> &
		Pick<BoostMappingCandidate, 'id' | 'provider' | 'ratePerThousand'>
): BoostMappingCandidate {
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
		const result = rankSmartBoostCandidates(
			[
				candidate({ id: 'a', provider: 'smm_raja', ratePerThousand: 1 }),
				candidate({ id: 'b', provider: 'smm_raja', ratePerThousand: 2 }),
				candidate({ id: 'c', provider: 'bulk_follows', ratePerThousand: 3 })
			],
			'value',
			3
		);
		expect(result.map((row) => row.id)).toEqual(['a', 'c', 'b']);
	});

	it('prioritizes advertised quality and refill signals for premium', () => {
		const result = rankSmartBoostCandidates(
			[
				candidate({ id: 'cheap', provider: 'smm_raja', ratePerThousand: 1 }),
				candidate({
					id: 'premium',
					provider: 'smm_raja',
					ratePerThousand: 5,
					refillAdvertised: true,
					qualitySignals: ['quality_claim', 'stability_claim']
				}),
				candidate({ id: 'other', provider: 'bulk_follows', ratePerThousand: 2 })
			],
			'premium',
			3
		);
		expect(result[0].id).toBe('premium');
	});

	it('accepts an explicit refill advertisement as stability evidence', () => {
		const result = rankSmartBoostCandidates(
			[
				candidate({
					id: 'refill-route',
					provider: 'bulk_follows',
					ratePerThousand: 1,
					refillAdvertised: true
				})
			],
			'stable'
		);
		expect(result.map((row) => row.id)).toEqual(['refill-route']);
	});
});

describe('manual supplier lookup', () => {
	function lookupDatabase(outcomes = ['followers']): PrismaClient {
		return {
			category: {
				findFirst: vi.fn().mockResolvedValue({
					metadata: {
						boosting_platform: 'x',
						boosting_action_type: 'followers',
						boosting_min_quantity: 200,
						boosting_step_quantity: 200
					}
				})
			},
			boostProviderService: {
				findUnique: vi.fn().mockResolvedValue({
					id: 'service-1',
					provider: 'bulk_follows',
					serviceId: '14545',
					name: 'Twitter Followers - 30 day refill',
					category: 'Twitter',
					description: null,
					providerType: null,
					ratePerThousand: 6.5,
					minQuantity: 10,
					maxQuantity: 100_000,
					refillAdvertised: true,
					cancelAdvertised: false,
					dripfeedAdvertised: false,
					qualitySignals: ['refill_claim'],
					catalogueStatus: 'ready_for_review',
					lastSeenAt: new Date(),
					unavailableAt: null,
					platforms: ['x'],
					outcomes,
					targetType: 'profile'
				})
			}
		} as unknown as PrismaClient;
	}

	it('allows an owner-tested premium service when only the catalogue quality words are missing', async () => {
		const result = await lookupBoostProviderService(
			{
				categoryId: 'category-1',
				provider: 'bulk_follows',
				serviceCode: '14545',
				qualityTier: 'premium'
			},
			lookupDatabase()
		);

		expect(result.compatible).toBe(true);
		expect(result.service?.serviceId).toBe('14545');
		expect(result.issues).toContain(
			'The supplier listing does not state premium, high-quality, HQ or real delivery; use your own test result.'
		);
	});

	it('still blocks a manually entered service that delivers a different result', async () => {
		const result = await lookupBoostProviderService(
			{
				categoryId: 'category-1',
				provider: 'bulk_follows',
				serviceCode: '14545',
				qualityTier: 'premium'
			},
			lookupDatabase(['views'])
		);

		expect(result.compatible).toBe(false);
		expect(result.issues).toContain('It delivers a different result.');
	});
});
