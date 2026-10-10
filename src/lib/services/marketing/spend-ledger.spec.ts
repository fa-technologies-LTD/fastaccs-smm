import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executeRaw: vi.fn((...args: unknown[]) => ({ args })),
	queryRaw: vi.fn(),
	transaction: vi.fn(async (ops: unknown[]) => ops)
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		$executeRaw: mocks.executeRaw,
		$queryRaw: mocks.queryRaw,
		$transaction: mocks.transaction
	}
}));

import {
	getSpendTotals,
	recordManualBooking,
	spreadBooking,
	upsertSpendRows
} from './spend-ledger';

describe('spreadBooking', () => {
	it('splits a booking across its days and adds back to the exact total', () => {
		const days = spreadBooking({ totalNgn: 10000, startDay: '2026-10-10', endDay: '2026-10-12' });
		expect(days.map((d) => d.day)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
		expect(days.map((d) => d.spendNgn)).toEqual([3333.33, 3333.33, 3333.34]);
		expect(days.reduce((sum, d) => sum + Math.round(d.spendNgn * 100), 0)).toBe(1_000_000);
	});

	it('handles a single day and month boundaries', () => {
		expect(spreadBooking({ totalNgn: 5800, startDay: '2026-10-31', endDay: '2026-10-31' })).toEqual(
			[{ day: '2026-10-31', spendNgn: 5800 }]
		);
		expect(
			spreadBooking({ totalNgn: 2, startDay: '2026-10-31', endDay: '2026-11-01' }).map((d) => d.day)
		).toEqual(['2026-10-31', '2026-11-01']);
	});

	it('rejects bad ranges', () => {
		expect(() =>
			spreadBooking({ totalNgn: 1, startDay: '2026-10-12', endDay: '2026-10-10' })
		).toThrow();
		expect(() =>
			spreadBooking({ totalNgn: 1, startDay: '10/10/2026', endDay: '2026-10-10' })
		).toThrow();
		expect(() =>
			spreadBooking({ totalNgn: 1, startDay: '2026-01-01', endDay: '2026-12-31' })
		).toThrow();
	});
});

describe('upsertSpendRows / recordManualBooking', () => {
	beforeEach(() => vi.clearAllMocks());

	it('writes nothing for an empty batch', async () => {
		expect(await upsertSpendRows([])).toBe(0);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('upserts one row per booked day inside a single transaction', async () => {
		const written = await recordManualBooking({
			channelKey: 'nairaland',
			campaignKey: 'sports-oct',
			placementKey: 'sports-board',
			totalNgn: 11600,
			startDay: '2026-10-10',
			endDay: '2026-10-11'
		});
		expect(written).toBe(2);
		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
		const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
		expect(sql).toContain('ON CONFLICT (channel_key, campaign_key, placement_key, day) DO UPDATE');
		expect(mocks.executeRaw.mock.calls[0]).toContain(5800);
	});
});

describe('getSpendTotals', () => {
	it('converts aggregate strings to numbers', async () => {
		mocks.queryRaw.mockResolvedValueOnce([
			{
				channel_key: 'nairaland',
				campaign_key: 'sports-oct',
				spend_ngn: '11600.00',
				impressions: '0',
				clicks: null
			}
		]);
		expect(await getSpendTotals(new Date('2026-10-01'))).toEqual([
			{
				channelKey: 'nairaland',
				campaignKey: 'sports-oct',
				spendNgn: 11600,
				impressions: 0,
				clicks: 0
			}
		]);
	});
});
