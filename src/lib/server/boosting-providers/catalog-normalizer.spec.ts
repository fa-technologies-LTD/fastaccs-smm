import { describe, expect, it } from 'vitest';
import {
	isUnsafeAutomaticServiceLabel,
	normalizeBoostProviderCatalog,
	normalizeBoostProviderService,
	serviceMatchesBoostOutcome
} from './catalog-normalizer';
import { BULK_FOLLOWS_SERVICE_FIXTURE, SMM_RAJA_SERVICE_FIXTURE } from './fixtures';

describe('boosting provider catalogue normalization', () => {
	it.each([
		['Facebook Comment React (100/20K) [LOVE]', 'Facebook Comments', 'comments'],
		['Telegram Poll VOTE', 'Telegram Comments', 'comments'],
		['Telegram Story Reactions', 'Telegram Reactions', 'reactions'],
		['YouTube Live CONCURRENT Views - 30 Minutes', 'YouTube Views', 'views'],
		['YouTube Custom Comments', 'YouTube Comments', 'comments']
	])('rejects specialised %s even with a broad cached category', (name, category, outcome) => {
		expect(serviceMatchesBoostOutcome({ name, category, providerType: 'Default' }, outcome)).toBe(
			false
		);
	});
	it.each([
		'S3 TikTok Live Comments (10/5K)',
		'TikTok Live-Stream Comments',
		'TikTok LIVE Custom Comments',
		'YouTube Live Chat Custom Comments'
	])('keeps unsupported stream comments out of ordinary post routes (%s)', (name) => {
		const row = { ...SMM_RAJA_SERVICE_FIXTURE, name, category: 'TikTok Comments', type: 'Default' };
		const normalized = normalizeBoostProviderService('smm_raja', row);
		expect(normalized).toMatchObject({
			outcomes: [],
			targetType: 'unknown',
			status: 'needs_classification'
		});
		expect(serviceMatchesBoostOutcome({ ...row, providerType: 'Default' }, 'comments')).toBe(false);
		expect(
			serviceMatchesBoostOutcome({ ...row, providerType: 'Custom Comments' }, 'custom_comments')
		).toBe(false);
	});
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

	it('classifies follower impressions as impressions rather than views or follower delivery', () => {
		const service = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			service: '14058',
			name: 'Twitter - New Followers Impressions',
			category: 'Twitter Followers',
			rate: '0.0106',
			min: '100',
			max: '100000'
		});
		expect(service).toMatchObject({
			platforms: ['x'],
			outcomes: ['impressions'],
			targetType: 'content',
			status: 'ready_for_review'
		});
	});

	it.each([
		['TikTok Live Likes', 'TikTok Likes', 'Default', 'live_likes'],
		['Instagram Impressions + Reach', 'Instagram Views', 'Default', 'impressions'],
		['Instagram Share', 'Instagram Story Shares From Verified Profiles', 'Default', 'story_shares'],
		['TikTok Comments', 'TikTok Comments', 'Custom Comments', 'custom_comments']
	])('keeps %s in its own result', (name, category, type, outcome) => {
		const service = normalizeBoostProviderService('smm_raja', {
			...SMM_RAJA_SERVICE_FIXTURE,
			name,
			category,
			type
		});
		expect(service.outcomes).toEqual([outcome]);
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

	it('classifies Threads separately even when a supplier mentions Instagram', () => {
		const service = normalizeBoostProviderService('smm_raja', {
			...SMM_RAJA_SERVICE_FIXTURE,
			name: 'S41 Threads Followers (1/100k) [HQ]',
			category: 'Threads (By Instagram) Followers'
		});
		expect(service.platforms).toEqual(['threads']);
		expect(service.outcomes).toEqual(['followers']);
		expect(service.status).toBe('ready_for_review');
	});

	it('does not treat a YouTube referrer label as a Threads service', () => {
		const service = normalizeBoostProviderService('smm_raja', {
			...SMM_RAJA_SERVICE_FIXTURE,
			name: 'YouTube Likes [Referrer from threads.net]',
			category: 'YouTube Likes | Referrer from Social Media'
		});
		expect(service.platforms).toEqual(['youtube']);
	});

	it('keeps misleading test and comment-reaction labels out of automatic suggestions', () => {
		expect(
			isUnsafeAutomaticServiceLabel({
				name: 'Instagram Followers Test',
				category: 'Instagram Followers'
			})
		).toBe(true);
		expect(
			isUnsafeAutomaticServiceLabel({
				name: 'Threads - Comment Quotes',
				category: 'Threads'
			})
		).toBe(true);
		expect(
			isUnsafeAutomaticServiceLabel({
				name: 'Threads Custom Comments',
				category: 'Threads Comments'
			})
		).toBe(false);
		expect(
			isUnsafeAutomaticServiceLabel({
				name: 'Instagram Followers India',
				category: 'Instagram Followers'
			})
		).toBe(true);
		expect(
			isUnsafeAutomaticServiceLabel({
				name: 'Instagram Followers Global',
				category: 'Instagram Followers'
			})
		).toBe(false);
	});

	it('recognizes a refill period stated in the supplier service name', () => {
		const service = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			name: 'Twitter Followers - REFILL 30D',
			category: 'Twitter Followers',
			refill: false
		});
		expect(service.refillAdvertised).toBe(true);
		expect(service.qualitySignals).toContain('refill_claim');
	});

	it('recognizes a refill period written with presentation Unicode characters', () => {
		const service = normalizeBoostProviderService('bulk_follows', {
			...BULK_FOLLOWS_SERVICE_FIXTURE,
			name: 'Twitter Followers - 𝗥𝗘𝗙𝗜𝗟𝗟 30D',
			category: 'Twitter Followers',
			refill: false
		});
		expect(service.refillAdvertised).toBe(true);
		expect(service.qualitySignals).toContain('refill_claim');
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
