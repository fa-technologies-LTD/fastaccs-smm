import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: { PROPELLERADS_API_TOKEN: '' } as Record<string, string>,
	executeRaw: vi.fn(async () => 1),
	upsertSpendRows: vi.fn(async (rows: unknown[]) => rows.length)
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/prisma', () => ({ prisma: { $executeRaw: mocks.executeRaw } }));
vi.mock('../spend-ledger', () => ({ upsertSpendRows: mocks.upsertSpendRows }));

import {
	PropellerApiError,
	excludePropellerZones,
	fetchPropellerBalanceUsd,
	fetchPropellerStats,
	syncPropellerSpend,
	toSpendRows
} from './propellerads';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.env.PROPELLERADS_API_TOKEN = '';
});

describe('fetchPropellerStats', () => {
	it('posts a grouped statistics request with the bearer token in Lagos time', async () => {
		const fetchImpl = vi.fn(async () => json([]));

		await fetchPropellerStats({
			token: 'tok',
			dayFrom: '2026-10-08',
			dayTo: '2026-10-10',
			fetchImpl
		});

		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://ssp-api.propellerads.com/v5/adv/statistics');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
		expect(JSON.parse(String(init.body))).toEqual({
			group_by: ['date_time', 'campaign_id', 'zone_id'],
			day_from: '2026-10-08 00:00:00',
			day_to: '2026-10-10 23:59:59',
			tz: '+0100',
			format: 'json'
		});
	});

	it('explains token and rate-limit failures', async () => {
		await expect(
			fetchPropellerStats({
				token: 'bad',
				dayFrom: '2026-10-10',
				dayTo: '2026-10-10',
				fetchImpl: vi.fn(async () => json({}, 401))
			})
		).rejects.toMatchObject({ status: 401, message: expect.stringContaining('token') });
		await expect(
			fetchPropellerStats({
				token: 't',
				dayFrom: '2026-10-10',
				dayTo: '2026-10-10',
				fetchImpl: vi.fn(async () => json({}, 429, { 'X-RateLimit-Reset': '2026-10-10T12:01:00Z' }))
			})
		).rejects.toBeInstanceOf(PropellerApiError);
	});
});

describe('toSpendRows', () => {
	it('maps API rows to ledger rows in naira, dropping empty rows', () => {
		expect(
			toSpendRows(
				[
					{
						date_time: '2026-10-10',
						campaign_id: 183788,
						zone_id: 5551,
						impressions: '1200',
						clicks: '40',
						conversions: 1,
						spent: '1.85'
					},
					{ date_time: '2026-10-10', campaign_id: 183788, zone_id: 5552, impressions: 0, spent: 0 },
					{ date_time: 'not a date', campaign_id: 1, zone_id: 2, impressions: 5, spent: 1 }
				],
				1500
			)
		).toEqual([
			{
				channelKey: 'propellerads',
				campaignKey: '183788',
				placementKey: '5551',
				day: '2026-10-10',
				spendUsd: 1.85,
				spendNgn: 2775,
				impressions: 1200,
				clicks: 40,
				conversions: 1,
				source: 'api'
			}
		]);
	});
});

describe('balance and zone blocking', () => {
	it('reads the balance string as a number', async () => {
		expect(
			await fetchPropellerBalanceUsd(
				't',
				vi.fn(async () => json('123.45'))
			)
		).toBe(123.45);
	});

	it('appends numeric zones to the campaign blocklist', async () => {
		const fetchImpl = vi.fn(async () => json({ zone: ['5551'] }));
		await excludePropellerZones({
			token: 't',
			campaignId: '183788',
			zoneIds: ['5551', ' 5551 '],
			fetchImpl
		});
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(
			'https://ssp-api.propellerads.com/v5/adv/campaigns/183788/targeting/exclude/zone'
		);
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(String(init.body))).toEqual({ zone: ['5551'] });
	});

	it('refuses non-numeric ids before calling the API', async () => {
		const fetchImpl = vi.fn();
		await expect(
			excludePropellerZones({ token: 't', campaignId: '1;drop', zoneIds: ['1'], fetchImpl })
		).rejects.toThrow();
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe('syncPropellerSpend', () => {
	it('skips quietly without a token', async () => {
		expect(await syncPropellerSpend({ usdNgnRate: 1500 })).toEqual({
			skipped: 'no_token',
			rows: 0,
			balanceUsd: null
		});
		expect(mocks.upsertSpendRows).not.toHaveBeenCalled();
	});

	it('imports the last days into the ledger and reads the balance', async () => {
		mocks.env.PROPELLERADS_API_TOKEN = 'tok';
		const fetchImpl = vi.fn(async (url: string) =>
			url.endsWith('/adv/balance')
				? json('42.10')
				: json([{ date_time: '2026-10-10', campaign_id: 1, zone_id: 2, impressions: 10, spent: 1 }])
		);

		const result = await syncPropellerSpend({
			usdNgnRate: 1500,
			days: 3,
			now: new Date('2026-10-10T12:00:00Z'),
			fetchImpl: fetchImpl as unknown as typeof fetch
		});

		expect(result).toEqual({ rows: 1, balanceUsd: 42.1 });
		expect(mocks.executeRaw).toHaveBeenCalledTimes(1); // ensures the channel row exists
		const body = JSON.parse(
			String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)
		);
		expect(body.day_from).toBe('2026-10-08 00:00:00');
		expect(body.day_to).toBe('2026-10-10 23:59:59');
	});
});
