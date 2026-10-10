import { prisma } from '$lib/prisma';

/**
 * Daily spend per channel / campaign / placement. Network spend is imported from APIs; direct
 * buys (a Nairaland board, a Telegram post) are booked once and spread across their days.
 * Raw SQL keeps this independent of the generated client until the models ship.
 */

export interface SpendRow {
	channelKey: string;
	campaignKey: string;
	placementKey: string;
	day: string; // YYYY-MM-DD
	spendNgn: number;
	spendUsd?: number | null;
	impressions?: number;
	clicks?: number;
	conversions?: number;
	source: 'api' | 'manual';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BOOKING_DAYS = 92;

function toUtcDay(day: string): Date {
	if (!DAY.test(day)) throw new Error(`Invalid day: ${day}`);
	const date = new Date(`${day}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid day: ${day}`);
	return date;
}

/**
 * Split a booking's total across its days in kobo, so the parts always add back to the exact
 * total (the remainder goes to the last day).
 */
export function spreadBooking(input: {
	totalNgn: number;
	startDay: string;
	endDay: string;
}): Array<{ day: string; spendNgn: number }> {
	const start = toUtcDay(input.startDay);
	const end = toUtcDay(input.endDay);
	if (end < start) throw new Error('End day is before start day');
	const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	if (days > MAX_BOOKING_DAYS) throw new Error(`Bookings are limited to ${MAX_BOOKING_DAYS} days`);
	const totalKobo = Math.round(Math.max(0, Number(input.totalNgn) || 0) * 100);
	const perDay = Math.floor(totalKobo / days);
	return Array.from({ length: days }, (_, index) => {
		const date = new Date(start.getTime() + index * 86_400_000);
		const kobo = index === days - 1 ? totalKobo - perDay * (days - 1) : perDay;
		return { day: date.toISOString().slice(0, 10), spendNgn: kobo / 100 };
	});
}

/** Insert or replace rows by (channel, campaign, placement, day). Re-importing is idempotent. */
export async function upsertSpendRows(rows: SpendRow[]): Promise<number> {
	if (rows.length === 0) return 0;
	await prisma.$transaction(
		rows.map(
			(row) => prisma.$executeRaw`
				INSERT INTO marketing_spend_daily
					(channel_key, campaign_key, placement_key, day, spend_ngn, spend_usd,
					 impressions, clicks, conversions, source, updated_at)
				VALUES
					(${row.channelKey}, ${row.campaignKey}, ${row.placementKey}, ${toUtcDay(row.day)}::date,
					 ${row.spendNgn}, ${row.spendUsd ?? null}, ${row.impressions ?? 0}, ${row.clicks ?? 0},
					 ${row.conversions ?? 0}, ${row.source}, now())
				ON CONFLICT (channel_key, campaign_key, placement_key, day) DO UPDATE SET
					spend_ngn = EXCLUDED.spend_ngn,
					spend_usd = EXCLUDED.spend_usd,
					impressions = EXCLUDED.impressions,
					clicks = EXCLUDED.clicks,
					conversions = EXCLUDED.conversions,
					source = EXCLUDED.source,
					updated_at = now()`
		)
	);
	return rows.length;
}

export async function recordManualBooking(input: {
	channelKey: string;
	campaignKey: string;
	placementKey: string;
	totalNgn: number;
	startDay: string;
	endDay: string;
}): Promise<number> {
	const days = spreadBooking(input);
	return upsertSpendRows(
		days.map((entry) => ({
			channelKey: input.channelKey,
			campaignKey: input.campaignKey,
			placementKey: input.placementKey,
			day: entry.day,
			spendNgn: entry.spendNgn,
			source: 'manual' as const
		}))
	);
}

export interface SpendTotal {
	channelKey: string;
	campaignKey: string;
	spendNgn: number;
	impressions: number;
	clicks: number;
}

/** Spend per channel + campaign since a date, for joining with the campaign report. */
export async function getSpendTotals(since: Date): Promise<SpendTotal[]> {
	const rows = await prisma.$queryRaw<
		Array<{
			channel_key: string;
			campaign_key: string;
			spend_ngn: unknown;
			impressions: unknown;
			clicks: unknown;
		}>
	>`
		SELECT channel_key, campaign_key, sum(spend_ngn) AS spend_ngn,
			sum(impressions) AS impressions, sum(clicks) AS clicks
		FROM marketing_spend_daily
		WHERE day >= ${since}::date
		GROUP BY channel_key, campaign_key`;
	return rows.map((row) => ({
		channelKey: row.channel_key,
		campaignKey: row.campaign_key,
		spendNgn: Number(row.spend_ngn) || 0,
		impressions: Number(row.impressions) || 0,
		clicks: Number(row.clicks) || 0
	}));
}
