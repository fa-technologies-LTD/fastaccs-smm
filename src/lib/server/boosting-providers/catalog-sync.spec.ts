import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { normalizeBoostProviderService } from './catalog-normalizer';
import { syncBoostProviderCatalogues } from './catalog-sync';
import { BoostProviderError } from './panel-client';
import type { BoostProviderReadClient } from './types';

const syncedAt = new Date('2026-09-11T12:00:00.000Z');

function client(overrides: Partial<BoostProviderReadClient> = {}): BoostProviderReadClient {
	return {
		id: 'smm_raja',
		label: 'SMM Raja',
		isConfigured: () => true,
		listServices: async () => [
			normalizeBoostProviderService('smm_raja', {
				service: '101',
				name: 'Instagram Followers',
				category: 'Instagram',
				rate: '1.25',
				min: '100',
				max: '10000',
				refill: true
			})
		],
		getBalance: async () => ({ provider: 'smm_raja', amount: 50, currency: 'USD' }),
		...overrides
	};
}

function database() {
	const providerUpsert = vi.fn().mockResolvedValue({});
	const executeRaw = vi.fn().mockResolvedValue(1);
	const markUnavailable = vi.fn().mockResolvedValue({ count: 2 });
	const tx = {
		boostProviderState: { upsert: providerUpsert },
		boostProviderService: { updateMany: markUnavailable },
		$executeRaw: executeRaw
	};
	const transaction = vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx));
	return {
		client: {
			boostProviderState: { upsert: providerUpsert },
			$transaction: transaction
		} as unknown as PrismaClient,
		providerUpsert,
		executeRaw,
		markUnavailable,
		transaction
	};
}

describe('boost supplier catalogue sync', () => {
	it('persists a non-empty normalized catalogue in bounded batches', async () => {
		const db = database();
		const result = await syncBoostProviderCatalogues({
			clients: [client()],
			database: db.client,
			now: () => syncedAt
		});

		expect(result).toEqual([
			expect.objectContaining({
				provider: 'smm_raja',
				status: 'synced',
				servicesSeen: 1,
				servicesMarkedUnavailable: 2,
				balance: 50,
				currency: 'USD'
			})
		]);
		expect(db.transaction).toHaveBeenCalledOnce();
		expect(db.executeRaw).toHaveBeenCalledOnce();
		const query = db.executeRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
		expect(query.sql).toContain('ARRAY[');
		expect(query.values.some(Array.isArray)).toBe(false);
		expect(db.markUnavailable).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ provider: 'smm_raja' }) })
		);
	});

	it('preserves the previous catalogue when a supplier unexpectedly returns no services', async () => {
		const db = database();
		const result = await syncBoostProviderCatalogues({
			clients: [client({ listServices: async () => [] })],
			database: db.client,
			now: () => syncedAt
		});

		expect(result[0]).toMatchObject({ status: 'failed', servicesSeen: 0 });
		expect(result[0].error).toContain('empty catalogue');
		expect(db.transaction).not.toHaveBeenCalled();
		expect(db.executeRaw).not.toHaveBeenCalled();
		expect(db.providerUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				update: expect.objectContaining({ consecutiveFailures: { increment: 1 } })
			})
		);
	});

	it('keeps a successful catalogue sync when only the balance check fails', async () => {
		const db = database();
		const result = await syncBoostProviderCatalogues({
			clients: [
				client({
					getBalance: async () => {
						throw new BoostProviderError(
							'Balance is temporarily unavailable.',
							'smm_raja',
							'timeout'
						);
					}
				})
			],
			database: db.client,
			now: () => syncedAt
		});

		expect(result[0]).toMatchObject({
			status: 'synced',
			balance: null,
			balanceWarning: 'Balance is temporarily unavailable.'
		});
		expect(db.executeRaw).toHaveBeenCalledOnce();
	});

	it('reports an unconfigured supplier without touching the database', async () => {
		const db = database();
		const result = await syncBoostProviderCatalogues({
			clients: [client({ isConfigured: () => false })],
			database: db.client,
			now: () => syncedAt
		});

		expect(result[0]).toMatchObject({ status: 'not_configured' });
		expect(db.transaction).not.toHaveBeenCalled();
		expect(db.providerUpsert).not.toHaveBeenCalled();
	});
});
