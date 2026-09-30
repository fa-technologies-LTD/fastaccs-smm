import { describe, expect, it } from 'vitest';
import { normalizeBoostProviderService } from './catalog-normalizer';
import { buildBoostCoverage, getBoostProviderDiscovery } from './discovery';
import { BULK_FOLLOWS_SERVICE_FIXTURE, SMM_RAJA_SERVICE_FIXTURE } from './fixtures';
import type { BoostProviderReadClient } from './types';

describe('boosting supplier discovery', () => {
	it('builds provider-separated coverage from normalized services', () => {
		const coverage = buildBoostCoverage([
			normalizeBoostProviderService('smm_raja', SMM_RAJA_SERVICE_FIXTURE),
			normalizeBoostProviderService('bulk_follows', {
				...BULK_FOLLOWS_SERVICE_FIXTURE,
				name: 'Instagram Followers',
				category: 'Instagram Followers'
			})
		]);
		const followers = coverage.find(
			(row) => row.platform === 'instagram' && row.outcome === 'followers'
		);
		expect(followers).toEqual({
			platform: 'instagram',
			outcome: 'followers',
			total: 2,
			readyForReview: 2,
			byProvider: { smm_raja: 1, bulk_follows: 1 }
		});
	});

	it('keeps one unavailable provider from hiding the healthy catalogue', async () => {
		const healthy: BoostProviderReadClient = {
			id: 'smm_raja',
			label: 'SMM Raja',
			isConfigured: () => true,
			listServices: async () => [
				normalizeBoostProviderService('smm_raja', SMM_RAJA_SERVICE_FIXTURE)
			],
			getBalance: async () => ({ provider: 'smm_raja', amount: 8.21, currency: 'USD' })
		};
		const unavailable: BoostProviderReadClient = {
			id: 'bulk_follows',
			label: 'BulkFollows',
			isConfigured: () => true,
			listServices: async () => {
				throw new Error('network down');
			},
			getBalance: async () => ({ provider: 'bulk_follows', amount: 0, currency: 'USD' })
		};

		const result = await getBoostProviderDiscovery({ clients: [healthy, unavailable] });
		expect(result.providers).toEqual([
			expect.objectContaining({ id: 'smm_raja', status: 'ready', totalServices: 1 }),
			expect.objectContaining({ id: 'bulk_follows', status: 'unavailable', totalServices: 0 })
		]);
		expect(result.coverage).toContainEqual(
			expect.objectContaining({ platform: 'instagram', outcome: 'followers', total: 1 })
		);
	});

	it('reports an unconfigured provider without making a network call', async () => {
		let called = false;
		const client: BoostProviderReadClient = {
			id: 'bulk_follows',
			label: 'BulkFollows',
			isConfigured: () => false,
			listServices: async () => {
				called = true;
				return [];
			},
			getBalance: async () => ({ provider: 'bulk_follows', amount: 0, currency: 'USD' })
		};
		const result = await getBoostProviderDiscovery({ clients: [client] });
		expect(called).toBe(false);
		expect(result.providers[0]).toMatchObject({ configured: false, status: 'not_configured' });
	});
});
