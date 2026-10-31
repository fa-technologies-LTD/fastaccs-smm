import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('$lib/services/admin-alerts', () => ({ sendCriticalAdminAlert: vi.fn() }));

import { alertLowBoostSupplierBalances } from './balance-alert';

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
	it('alerts once a day for a supplier below its reserve plus float, never for a healthy or unread one', async () => {
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
		const alerted = await alertLowBoostSupplierBalances({ database: database as never, send, now });
		expect(alerted).toEqual(['smm_raja']);
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'SMM Raja needs funding',
				source: 'boosting.balance',
				dedupeKey: 'boost-low-balance:smm_raja:2026-10-31'
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
		expect(await alertLowBoostSupplierBalances({ database: database as never, send, now })).toEqual(
			['smm_raja']
		);
		expect(send.mock.calls[0][0].message).toContain('$20.00 safety reserve');

		const broken = {
			boostProviderState: { findMany: vi.fn(async () => Promise.reject(new Error('db down'))) }
		};
		await expect(
			alertLowBoostSupplierBalances({ database: broken as never, send, now })
		).resolves.toEqual([]);
	});
});
