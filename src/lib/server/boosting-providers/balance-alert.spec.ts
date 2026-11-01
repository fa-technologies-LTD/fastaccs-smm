import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('$lib/services/admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn() }));

import { alertBoostOrdersAwaitingFunds, alertLowBoostSupplierBalances } from './balance-alert';

const now = new Date('2026-10-31T12:00:00.000Z');
const state = (patch: Record<string, unknown>) => ({
	provider: 'smm_raja',
	label: 'SMM Raja',
	balance: 40,
	projectedBalance: 40,
	lastBalanceSuccessAt: now,
	...patch
});

afterEach(() => vi.unstubAllEnvs());

describe('Boosting supplier funding alert', () => {
	it('alerts at most once every 24 h for a supplier below its reserve plus float, never for a healthy or unread one', async () => {
		const send = vi.fn<(alert: { title: string; message: string }) => Promise<{ sent: boolean }>>(
			async () => ({ sent: true })
		);
		const database = {
			boostProviderState: {
				findMany: vi.fn(async () => [
					state({ projectedBalance: 3.2 }),
					state({ provider: 'bulk_follows', label: 'BulkFollows', projectedBalance: 80 }),
					state({
						provider: 'unread',
						label: 'Unread',
						projectedBalance: 0,
						lastBalanceSuccessAt: null
					})
				])
			}
		};
		const alerted = await alertLowBoostSupplierBalances({ database: database as never, send });
		expect(alerted).toEqual(['smm_raja']);
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'SMM Raja needs funding',
				source: 'boosting.balance',
				dedupeKey: 'boost-low-balance:smm_raja',
				cooldownMs: 24 * 60 * 60 * 1000
			})
		);
		expect(send.mock.calls[0][0].message).toContain('$3.20 left');
	});

	it('uses the configured reserve and alert level, and a database failure never escapes', async () => {
		vi.stubEnv('BOOSTING_BALANCE_SAFETY_USD', '20');
		vi.stubEnv('BOOSTING_LOW_BALANCE_ALERT_USD', '50');
		const send = vi.fn<(alert: { title: string; message: string }) => Promise<{ sent: boolean }>>(
			async () => ({ sent: true })
		);
		const database = {
			boostProviderState: { findMany: vi.fn(async () => [state({ projectedBalance: 40 })]) }
		};
		expect(await alertLowBoostSupplierBalances({ database: database as never, send })).toEqual([
			'smm_raja'
		]);
		expect(send.mock.calls[0][0].message).toContain('$20.00 safety reserve');

		const broken = {
			boostProviderState: { findMany: vi.fn(async () => Promise.reject(new Error('db down'))) }
		};
		await expect(
			alertLowBoostSupplierBalances({ database: broken as never, send })
		).resolves.toEqual([]);
	});

	it('says straight away when paid orders wait for supplier money, once a day per supplier', async () => {
		const send = vi.fn<(alert: { title: string; message: string }) => Promise<{ sent: boolean }>>(
			async () => ({ sent: true })
		);
		const database = {
			boostFulfillment: { count: vi.fn(async () => 2) },
			boostProviderState: {
				findMany: vi.fn(async () => [
					state({ provider: 'bulk_follows', label: 'BulkFollows', projectedBalance: 1.48 })
				])
			}
		};
		expect(await alertBoostOrdersAwaitingFunds([], { database: database as never, send })).toEqual(
			[]
		);
		expect(send).not.toHaveBeenCalled();
		expect(
			await alertBoostOrdersAwaitingFunds(['bulk_follows'], { database: database as never, send })
		).toEqual(['bulk_follows']);
		expect(database.boostFulfillment.count).toHaveBeenCalledWith({
			where: { status: 'queued', lastSafeErrorCategory: 'awaiting_supplier_funds' }
		});
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'BulkFollows needs funding: paid orders are waiting',
				dedupeKey: 'boost-awaiting-funds:bulk_follows',
				cooldownMs: 24 * 60 * 60 * 1000
			})
		);
		expect(send.mock.calls[0][0].message).toContain('2 paid Boosting orders are waiting');
		expect(send.mock.calls[0][0].message).toContain('BulkFollows has $1.48');
	});
});
