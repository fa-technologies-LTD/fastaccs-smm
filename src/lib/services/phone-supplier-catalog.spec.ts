import { describe, expect, it, vi } from 'vitest';
import {
	persistPhoneSupplierCatalogSnapshot,
	phoneSupplierCatalogRouteKey
} from './phone-supplier-catalog';

function route(providerServiceRef = 'Whatsapp24') {
	return {
		provider: 'pvapins',
		serviceId: 1,
		serviceName: 'WhatsApp',
		countryId: 58,
		countryName: 'USA',
		providerServiceRef,
		providerCountryRef: 'USA',
		costCents: 66,
		available: 1,
		stockConfidence: 'listed' as const
	};
}

describe('phone supplier catalogue snapshots', () => {
	it('uses the same exact-route identity as reliability telemetry', () => {
		expect(phoneSupplierCatalogRouteKey(route())).toBe('pvapins:route:1:58:Whatsapp24');
	});

	it('upserts seen routes and marks missing routes unavailable only inside successful scopes', async () => {
		const executeRaw = vi.fn().mockResolvedValue(1);
		const updateMany = vi.fn().mockResolvedValue({ count: 1 });
		const database = {
			$transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) =>
				work({ $executeRaw: executeRaw, phoneSupplierCatalogRoute: { updateMany } })
			)
		};
		const syncedAt = new Date('2026-09-23T10:00:00Z');
		await persistPhoneSupplierCatalogSnapshot({
			routes: [route()],
			scopes: [{ provider: 'pvapins', countryId: 58, serviceIds: [1] }],
			syncedAt,
			database: database as never
		});

		// One bulk route upsert plus one durable successful-scope upsert.
		expect(executeRaw).toHaveBeenCalledTimes(2);
		expect(updateMany).toHaveBeenCalledWith({
			where: {
				provider: 'pvapins',
				countryId: 58,
				serviceId: { in: [1] },
				unavailableAt: null,
				routeKey: { notIn: ['pvapins:route:1:58:Whatsapp24'] }
			},
			data: { unavailableAt: syncedAt }
		});
	});

	it('persists a successful empty scope so it is not confused with an unfetched market', async () => {
		const executeRaw = vi.fn().mockResolvedValue(1);
		const updateMany = vi.fn().mockResolvedValue({ count: 0 });
		const database = {
			$transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) =>
				work({ $executeRaw: executeRaw, phoneSupplierCatalogRoute: { updateMany } })
			)
		};
		await persistPhoneSupplierCatalogSnapshot({
			routes: [],
			scopes: [{ provider: 'pvapins', countryId: 58, serviceIds: [1] }],
			database: database as never
		});

		expect(executeRaw).toHaveBeenCalledTimes(1);
		expect(updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ provider: 'pvapins', countryId: 58 })
			})
		);
	});

	it('preserves a provider country omitted from successful replacement scopes', async () => {
		const updateMany = vi.fn();
		const database = {
			$transaction: vi.fn(async (work: (tx: unknown) => Promise<void>) =>
				work({ $executeRaw: vi.fn(), phoneSupplierCatalogRoute: { updateMany } })
			)
		};
		await persistPhoneSupplierCatalogSnapshot({
			routes: [],
			scopes: [],
			database: database as never
		});
		expect(updateMany).not.toHaveBeenCalled();
	});
});
