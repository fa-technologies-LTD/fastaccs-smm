import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { upsertSpendRows, type SpendRow } from '../spend-ledger';

/**
 * PropellerAds SSP API v5 (https://ssp-api.propellerads.com/v5/docs/, advertiser spec).
 * Bearer token from the SSP "Profile" page, stored as PROPELLERADS_API_TOKEN.
 * Spend is reported in USD; we store both USD and the naira equivalent.
 *
 * Verified against the published OpenAPI spec only; confirm field names with a real token before
 * relying on the numbers (see `fetchPropellerStats`).
 */

export const PROPELLER_CHANNEL_KEY = 'propellerads';
const API = 'https://ssp-api.propellerads.com/v5';
const TIMEOUT_MS = 20_000;
const LAGOS_TZ = '+0100';

type FetchImpl = typeof fetch;

export class PropellerApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'PropellerApiError';
	}
}

export function getPropellerToken(): string {
	return String(env.PROPELLERADS_API_TOKEN ?? '').trim();
}

async function call<T>(
	token: string,
	path: string,
	init: { method: string; body?: unknown },
	fetchImpl: FetchImpl
): Promise<T> {
	const response = await fetchImpl(`${API}${path}`, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			...(init.body === undefined ? {} : { 'Content-Type': 'application/json' })
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (response.status === 401)
		throw new PropellerApiError('PropellerAds rejected the API token', 401);
	if (response.status === 429) {
		const reset = response.headers.get('X-RateLimit-Reset') ?? 'soon';
		throw new PropellerApiError(`PropellerAds rate limit reached; resets ${reset}`, 429);
	}
	if (!response.ok) {
		throw new PropellerApiError(`PropellerAds API returned ${response.status}`, response.status);
	}
	return (await response.json()) as T;
}

export interface PropellerStatRow {
	date_time?: string;
	campaign_id?: number | string;
	zone_id?: number | string;
	impressions?: number | string;
	clicks?: number | string;
	conversions?: number | string;
	spent?: number | string;
}

/** Daily spend per campaign and zone, in Lagos time. */
export async function fetchPropellerStats(input: {
	token: string;
	dayFrom: string; // YYYY-MM-DD
	dayTo: string;
	fetchImpl?: FetchImpl;
}): Promise<PropellerStatRow[]> {
	return call<PropellerStatRow[]>(
		input.token,
		'/adv/statistics',
		{
			method: 'POST',
			body: {
				group_by: ['date_time', 'campaign_id', 'zone_id'],
				day_from: `${input.dayFrom} 00:00:00`,
				day_to: `${input.dayTo} 23:59:59`,
				tz: LAGOS_TZ,
				format: 'json'
			}
		},
		input.fetchImpl ?? fetch
	);
}

const num = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

/** Pure mapping from API rows to ledger rows. Rows with no spend and no traffic are dropped. */
export function toSpendRows(rows: PropellerStatRow[], usdNgnRate: number): SpendRow[] {
	return rows.flatMap((row) => {
		const day = String(row.date_time ?? '').slice(0, 10);
		const spendUsd = num(row.spent);
		const impressions = Math.round(num(row.impressions));
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (spendUsd === 0 && impressions === 0)) return [];
		return [
			{
				channelKey: PROPELLER_CHANNEL_KEY,
				campaignKey: String(row.campaign_id ?? ''),
				placementKey: String(row.zone_id ?? ''),
				day,
				spendUsd,
				spendNgn: Math.round(spendUsd * usdNgnRate * 100) / 100,
				impressions,
				clicks: Math.round(num(row.clicks)),
				conversions: Math.round(num(row.conversions)),
				source: 'api' as const
			}
		];
	});
}

export async function fetchPropellerBalanceUsd(
	token: string,
	fetchImpl: FetchImpl = fetch
): Promise<number> {
	return num(await call<string | number>(token, '/adv/balance', { method: 'GET' }, fetchImpl));
}

/** Add zones to a campaign's blocklist (PATCH appends; it does not replace the list). */
export async function excludePropellerZones(input: {
	token: string;
	campaignId: string;
	zoneIds: string[];
	fetchImpl?: FetchImpl;
}): Promise<void> {
	const zones = [...new Set(input.zoneIds.map((zone) => zone.trim()).filter(Boolean))];
	if (
		!/^\d+$/.test(input.campaignId) ||
		zones.length === 0 ||
		zones.some((z) => !/^\d+$/.test(z))
	) {
		throw new Error('Campaign and zone ids must be numeric');
	}
	await call(
		input.token,
		`/adv/campaigns/${input.campaignId}/targeting/exclude/zone`,
		{ method: 'PATCH', body: { zone: zones } },
		input.fetchImpl ?? fetch
	);
}

function lagosDay(date: Date): string {
	return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

export interface SpendSyncResult {
	skipped?: 'no_token';
	rows: number;
	balanceUsd: number | null;
}

/**
 * Re-import the last few days (networks revise recent stats) into the spend ledger.
 * Safe to run repeatedly: rows are upserted by (campaign, zone, day).
 */
export async function syncPropellerSpend(
	input: { days?: number; usdNgnRate: number; now?: Date; fetchImpl?: FetchImpl } = {
		usdNgnRate: 1500
	}
): Promise<SpendSyncResult> {
	const token = getPropellerToken();
	if (!token) return { skipped: 'no_token', rows: 0, balanceUsd: null };
	const now = input.now ?? new Date();
	const days = Math.max(1, Math.min(input.days ?? 3, 14));
	const dayTo = lagosDay(now);
	const dayFrom = lagosDay(new Date(now.getTime() - (days - 1) * 86_400_000));

	await prisma.$executeRaw`
		INSERT INTO marketing_channels (key, name, kind, status, updated_at)
		VALUES (${PROPELLER_CHANNEL_KEY}, 'PropellerAds', 'network', 'testing', now())
		ON CONFLICT (key) DO NOTHING`;

	const stats = await fetchPropellerStats({ token, dayFrom, dayTo, fetchImpl: input.fetchImpl });
	const rows = toSpendRows(stats, input.usdNgnRate);
	await upsertSpendRows(rows);
	const balanceUsd = await fetchPropellerBalanceUsd(token, input.fetchImpl).catch(() => null);
	return { rows: rows.length, balanceUsd };
}
