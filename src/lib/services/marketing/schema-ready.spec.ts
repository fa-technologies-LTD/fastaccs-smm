import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	dispatch: vi.fn(),
	sync: vi.fn(),
	rate: vi.fn()
}));
vi.mock('$lib/prisma', () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock('$lib/services/marketing/postbacks', () => ({ dispatchAdPostbacks: mocks.dispatch }));
vi.mock('$lib/services/marketing/spend-sources/propellerads', () => ({
	syncPropellerSpend: mocks.sync
}));
vi.mock('$lib/services/marketing/fx', () => ({ getMarketingUsdNgnRate: mocks.rate }));
vi.mock('$lib/server/automation-cron', () => ({
	runAuthorizedAutomationCron: async ({ work }: { work: () => Promise<unknown> }) =>
		Response.json(await work())
}));

import { isMarketingSchemaReady } from './schema-ready';
import { GET as postbacks } from '../../../routes/api/internal/cron/marketing-postbacks/+server';
import { GET as spend } from '../../../routes/api/internal/cron/marketing-spend-sync/+server';

beforeEach(() => vi.resetAllMocks());

describe('marketing migration deployment boundary', () => {
	it('recognizes all three tables and fails closed for an empty result', async () => {
		mocks.query.mockResolvedValueOnce([{ ready: true }]).mockResolvedValueOnce([]);
		expect(await isMarketingSchemaReady()).toBe(true);
		expect(await isMarketingSchemaReady()).toBe(false);
	});
	it('skips both workers before migration without any external work', async () => {
		mocks.query.mockResolvedValue([{ ready: false }]);
		for (const handler of [postbacks, spend]) {
			const response = await (handler as CallableFunction)({
				request: new Request('http://localhost/')
			});
			expect(await response.json()).toMatchObject({
				skipped: true,
				reason: 'marketing-migration-pending',
				processed: 0
			});
		}
		expect(mocks.dispatch).not.toHaveBeenCalled();
		expect(mocks.sync).not.toHaveBeenCalled();
		expect(mocks.rate).not.toHaveBeenCalled();
	});
	it('runs the workers only after readiness, preserving their metrics', async () => {
		mocks.query.mockResolvedValue([{ ready: true }]);
		mocks.dispatch.mockResolvedValue({ examined: 2, rejected: 1 });
		mocks.rate.mockResolvedValue(1500);
		mocks.sync.mockResolvedValue({ rows: 3 });
		expect(
			await (
				await (postbacks as CallableFunction)({ request: new Request('http://localhost/') })
			).json()
		).toMatchObject({ processed: 2, failed: 1 });
		expect(
			await (
				await (spend as CallableFunction)({ request: new Request('http://localhost/') })
			).json()
		).toMatchObject({ processed: 3 });
		expect(mocks.sync).toHaveBeenCalledWith({ usdNgnRate: 1500, days: 3 });
	});
	it('does not hide a real database outage as a pending migration', async () => {
		mocks.query.mockRejectedValue(new Error('database offline'));
		await expect(isMarketingSchemaReady()).rejects.toThrow('database offline');
	});
});
