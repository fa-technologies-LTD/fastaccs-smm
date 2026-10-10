import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), executeRaw: vi.fn(async () => 1) }));

vi.mock('$lib/prisma', () => ({
	prisma: { $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw }
}));

import { getPlacementReport, listHeldPostbacks, recordMarketingAction } from './placement-report';

const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

beforeEach(() => vi.clearAllMocks());

describe('getPlacementReport', () => {
	it('joins network spend and attributed sales by campaign + zone', async () => {
		mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
			const text = strings.join('?');
			if (text.includes('FROM marketing_spend_daily')) {
				return [
					{
						channel_key: 'propellerads',
						campaign_key: '183788',
						placement_key: '5551',
						spend_ngn: '9000.00',
						impressions: '30000',
						clicks: '600'
					},
					{
						channel_key: 'propellerads',
						campaign_key: '183788',
						placement_key: '7777',
						spend_ngn: '8000.00',
						impressions: '20000',
						clicks: '400'
					}
				];
			}
			return [
				{
					channel_key: 'propellerads',
					campaign_key: '183788',
					placement_key: '5551',
					buyers: '3',
					orders: '4',
					revenue_ngn: '24000'
				},
				{
					channel_key: 'nairaland',
					campaign_key: 'sports-oct',
					placement_key: '',
					buyers: '1',
					orders: '1',
					revenue_ngn: '6000'
				}
			];
		});

		const rows = await getPlacementReport({
			days: 30,
			sinceDay: '2026-09-11',
			sinceUtc: new Date('2026-09-10T23:00:00.000Z')
		});

		expect(rows[0]).toEqual({
			channelKey: 'propellerads',
			campaignKey: '183788',
			placementKey: '5551',
			spendNgn: 9000,
			impressions: 30000,
			clicks: 600,
			buyers: 3,
			orders: 4,
			revenueNgn: 24000
		});
		expect(rows.find((row) => row.placementKey === '7777')).toMatchObject({
			spendNgn: 8000,
			buyers: 0
		});
		expect(rows.find((row) => row.channelKey === 'nairaland')).toMatchObject({
			spendNgn: 0,
			buyers: 1
		});
		const spendCall = mocks.queryRaw.mock.calls[0] as unknown[];
		expect(spendCall).toContain('2026-09-11'); // business-day boundary for spend
		const salesCall = mocks.queryRaw.mock.calls[1] as unknown[];
		expect(sql(salesCall)).toContain("status <> 'refunded'");
		expect(sql(salesCall)).toContain("payment_channel <> 'manual_release'");
		expect(salesCall).toContainEqual(new Date('2026-09-10T23:00:00.000Z')); // Lagos midnight
	});
});

describe('listHeldPostbacks', () => {
	it('maps held orders for review', async () => {
		mocks.queryRaw.mockResolvedValueOnce([
			{
				id: 'o1',
				order_number: 'ORD-1',
				channel_key: 'propellerads',
				net_ngn: '6000',
				last_result: 'TimeoutError: may have been recorded',
				attempts: '1',
				paid_at: new Date('2026-10-10T10:00:00Z')
			}
		]);
		expect(await listHeldPostbacks()).toEqual([
			{
				orderId: 'o1',
				orderNumber: 'ORD-1',
				channelKey: 'propellerads',
				netNgn: 6000,
				lastResult: 'TimeoutError: may have been recorded',
				attempts: 1,
				paidAt: '2026-10-10T10:00:00.000Z'
			}
		]);
	});
});

describe('recordMarketingAction', () => {
	it('writes an audit row', async () => {
		await recordMarketingAction({
			channelKey: 'propellerads',
			campaignKey: '183788',
			placementKey: '7777',
			action: 'block_zone',
			reason: 'Spent ₦8,000 with no buyers',
			actor: 'admin@fastaccs'
		});
		expect(sql(mocks.executeRaw.mock.calls[0])).toContain('INSERT INTO marketing_actions');
	});
});
