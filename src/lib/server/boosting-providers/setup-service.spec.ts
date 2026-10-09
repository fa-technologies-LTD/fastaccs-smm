import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { BoostMappingCandidate } from '$lib/helpers/boosting-mapping-types';
import {
	lookupBoostProviderService,
	rankSmartBoostCandidates,
	recommendBoostProviderServices
} from './setup-service';

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
				candidate({ id: 'b', provider: 'smm_raja', ratePerThousand: 1.2 }),
				candidate({ id: 'c', provider: 'bulk_follows', ratePerThousand: 1.4 })
			],
			'value',
			3
		);
		expect(result.map((row) => row.id)).toEqual(['a', 'c', 'b']);
	});

	it('keeps one Smart Auto shortlist inside a comparable supplier-price band', () => {
		const result = rankSmartBoostCandidates(
			[
				candidate({ id: 'anchor', provider: 'smm_raja', ratePerThousand: 1 }),
				candidate({ id: 'nearby', provider: 'bulk_follows', ratePerThousand: 1.5 }),
				candidate({ id: 'far-away', provider: 'bulk_follows', ratePerThousand: 4.8 })
			],
			'value',
			4
		);
		expect(result.map((row) => row.id)).toEqual(['anchor', 'nearby']);
	});

	it('refreshes into the next safe price cluster instead of mixing price extremes', () => {
		const candidates = [
			candidate({ id: 'cheap-a', provider: 'smm_raja', ratePerThousand: 1 }),
			candidate({ id: 'cheap-b', provider: 'bulk_follows', ratePerThousand: 1.4 }),
			candidate({ id: 'higher-a', provider: 'smm_raja', ratePerThousand: 3 }),
			candidate({ id: 'higher-b', provider: 'bulk_follows', ratePerThousand: 4 })
		];
		const result = rankSmartBoostCandidates(candidates, 'value', 4, 2);
		expect(result.map((row) => row.id)).toEqual(['higher-a', 'higher-b']);
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
	it('passes SMM Raja prefixed service codes to the catalogue lookup unchanged', async () => {
		const db = lookupDatabase();
		await lookupBoostProviderService({ categoryId: 'category-1', provider: 'smm_raja', serviceCode: 's4138' }, db);
		expect(db.boostProviderService.findUnique).toHaveBeenCalledWith({ where: { provider_serviceId: { provider: 'smm_raja', serviceId: 's4138' } } });
	});

	function lookupDatabase(
		overrides: {
			outcomes?: string[];
			name?: string;
			category?: string;
			platforms?: string[];
			customerPlatform?: string;
		} = {}
	): PrismaClient {
		return {
			category: {
				findFirst: vi.fn().mockResolvedValue({
					metadata: {
						boosting_platform: overrides.customerPlatform ?? 'x',
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
					name: overrides.name ?? 'Twitter Followers - 30 day refill',
					category: overrides.category ?? 'Twitter',
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
					platforms: overrides.platforms ?? ['x'],
					outcomes: overrides.outcomes ?? ['followers'],
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
			lookupDatabase({ outcomes: ['views'] })
		);

		expect(result.compatible).toBe(false);
		expect(result.issues).toContain('It delivers a different result.');
	});

	it('blocks a stale Threads row even if an old sync labelled it as Instagram', async () => {
		const result = await lookupBoostProviderService(
			{
				categoryId: 'category-1',
				provider: 'smm_raja',
				serviceCode: '6699',
				qualityTier: 'premium'
			},
			lookupDatabase({
				name: 'S41 Threads Followers (1/100k) [HQ]',
				category: 'Instagram Followers',
				platforms: ['instagram'],
				customerPlatform: 'instagram'
			})
		);

		expect(result.compatible).toBe(false);
		expect(result.issues).toContain('It is a Threads service, not this platform.');
	});
});

describe('automatic supplier recommendations', () => {
	function serviceRow(id: string, name: string, rate: number) {
		return {
			id,
			provider: 'smm_raja',
			serviceId: id,
			name,
			category: 'Instagram Followers',
			description: null,
			providerType: null,
			ratePerThousand: rate,
			minQuantity: 100,
			maxQuantity: 1_000_000,
			refillAdvertised: true,
			cancelAdvertised: false,
			dripfeedAdvertised: false,
			qualitySignals: ['quality_claim', 'refill_claim'],
			catalogueStatus: 'ready_for_review',
			lastSeenAt: new Date(),
			unavailableAt: null,
			platforms: ['instagram'],
			outcomes: ['followers'],
			targetType: 'profile'
		};
	}

	it('rejects stale Threads and supplier test rows before ranking', async () => {
		const database = {
			category: {
				findFirst: vi.fn().mockResolvedValue({
					metadata: {
						boosting_platform: 'instagram',
						boosting_action_type: 'followers',
						boosting_min_quantity: 100,
						boosting_step_quantity: 100
					}
				})
			},
			boostProviderService: {
				findMany: vi
					.fn()
					.mockResolvedValue([
						serviceRow('threads', 'S41 Threads Followers [HQ]', 0.9),
						serviceRow('test', 'Instagram Followers Test', 0.4),
						serviceRow('valid', 'Instagram Followers Real Refill', 1.1)
					])
			}
		} as unknown as PrismaClient;

		const result = await recommendBoostProviderServices(
			{ categoryId: 'category-1', qualityTier: 'premium' },
			database
		);

		expect(result.map((row) => row.id)).toEqual(['valid']);
	});
});
