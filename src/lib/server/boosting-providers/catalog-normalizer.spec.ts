import { describe, expect, it } from 'vitest';
import { normalizeBoostProviderCatalog, normalizeBoostProviderService } from './catalog-normalizer';
import { BULK_FOLLOWS_SERVICE_FIXTURE, SMM_RAJA_SERVICE_FIXTURE } from './fixtures';

describe('boosting provider catalogue normalization', () => {
	it('normalizes the scrubbed SMM Raja response shape', () => {
		const service = normalizeBoostProviderService('smm_raja', SMM_RAJA_SERVICE_FIXTURE);
		expect(service).toMatchObject({
			provider: 'smm_raja',
			serviceId: '11001',
			platforms: ['instagram'],
			outcomes: ['followers'],
			targetType: 'profile',
			ratePerThousand: 0.75,
			minQuantity: 100,
			maxQuantity: 10_000,
			refillAdvertised: true,
			status: 'ready_for_review'
		});
		expect(service.qualitySignals).toContain('refill_claim');
		expect(service.fingerprint).toHaveLength(64);
	});

	it('normalizes numeric service ids and boolean flags from BulkFollows', () => {
		const service = normalizeBoostProviderService('bulk_follows', BULK_FOLLOWS_SERVICE_FIXTURE);
		expect(service).toMatchObject({
			serviceId: '22002',
			platforms: ['tiktok'],
			outcomes: ['views'],
			targetType: 'content',
			cancelAdvertised: true,
			status: 'ready_for_review'
		});
	});

	it('uses the service name before a broad category when classifying outcomes', () => {
		const service = normalizeBoostProviderService('smm_raja', {
			...SMM_RAJA_SERVICE_FIXTURE,
			name: 'Instagram Likes - Fast',
			category: 'Instagram Followers, Likes and Views'
		});
		expect(service.outcomes).toEqual(['likes']);
		expect(service.targetType).toBe('content');
	});

	it('recognizes X without treating unrelated letter-x words as the platform', () => {
		const xService = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			name: 'X Followers',
			category: 'Twitter / X'
		});
		const unrelated = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			name: 'Maximum quality followers',
			category: 'Other networks'
		});
		expect(xService.platforms).toEqual(['x']);
		expect(unrelated.platforms).toEqual([]);
	});

	it('quarantines malformed commercial data and flags extreme rates', () => {
		const malformed = normalizeBoostProviderService('smm_raja', {
			name: 'Instagram Followers',
			rate: '0',
			min: '1000',
			max: '100'
		});
		const outlier = normalizeBoostProviderService('smm_raja', {
			...SMM_RAJA_SERVICE_FIXTURE,
			rate: '1000000000'
		});
		const unpersistable = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			rate: '1000000000000000'
		});
		expect(malformed.status).toBe('quarantined');
		expect(malformed.anomalies).toEqual(
			expect.arrayContaining(['missing_service_id', 'invalid_rate', 'invalid_quantity_range'])
		);
		expect(outlier.status).toBe('needs_classification');
		expect(outlier.anomalies).toContain('suspicious_rate');
		expect(unpersistable).toMatchObject({
			ratePerThousand: null,
			status: 'quarantined',
			anomalies: expect.arrayContaining(['invalid_rate', 'suspicious_rate'])
		});
	});

	it('rejects a non-array services payload', () => {
		expect(() => normalizeBoostProviderCatalog('smm_raja', { services: [] })).toThrow(
			'Provider services response must be an array.'
		);
	});
});
