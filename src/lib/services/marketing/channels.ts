import { prisma } from '$lib/prisma';
import { slugifyUtm } from '$lib/helpers/tracked-link';

/**
 * Marketing channels (one per utm_source). The owner pastes a network's postback URL exactly as
 * the network shows it; we accept the common click-id/payout tokens and fill them per sale.
 */

export interface MarketingChannel {
	key: string;
	name: string;
	kind: 'network' | 'direct' | 'affiliate' | 'seo';
	status: 'testing' | 'scaling' | 'paused' | 'killed';
	targetCacNgn: number | null;
	dailyCapNgn: number | null;
	postbackTemplate: string | null;
	dedupByClickId: boolean;
	notes: string | null;
}

const KINDS = new Set(['network', 'direct', 'affiliate', 'seo']);
const STATUSES = new Set(['testing', 'scaling', 'paused', 'killed']);

// Network spellings of "the click id" and "the payout" in postback URLs.
const CLICK_ID_TOKENS = [
	'${SUBID}',
	'${subid}',
	'{SUBID}',
	'{subid}',
	'{click_id}',
	'{clickid}',
	'{CLICK_ID}',
	'{CLICKID}'
];
const PAYOUT_TOKENS = ['${PAYOUT}', '${payout}', '{PAYOUT}', '{payout}'];

export function validatePostbackTemplate(template: string): string | null {
	const value = template.trim();
	if (!value) return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('Postback must be a full URL');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error('Postback must start with http:// or https://');
	}
	if (!CLICK_ID_TOKENS.some((token) => value.includes(token))) {
		throw new Error('Postback must contain the click id token, e.g. ${SUBID}');
	}
	return value;
}

/** Fill a postback template for one sale. Values are URL-encoded; unknown tokens are left. */
export function renderPostback(
	template: string,
	values: { clickId: string; payoutUsd: number }
): string {
	let url = template;
	for (const token of CLICK_ID_TOKENS)
		url = url.split(token).join(encodeURIComponent(values.clickId));
	const payout = values.payoutUsd > 0 ? values.payoutUsd.toFixed(2) : '0';
	for (const token of PAYOUT_TOKENS) url = url.split(token).join(payout);
	return url;
}

function optionalInt(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const number = Math.round(Number(value));
	if (!Number.isFinite(number) || number < 0) throw new Error('Amounts must be positive numbers');
	return number;
}

export function normalizeChannelInput(input: Record<string, unknown>): MarketingChannel {
	const key = slugifyUtm(String(input.key ?? ''));
	if (!key)
		throw new Error('Channel key is required (use the utm_source value, e.g. propellerads)');
	const name = String(input.name ?? '').trim() || key;
	const kind = String(input.kind ?? 'network');
	const status = String(input.status ?? 'testing');
	if (!KINDS.has(kind)) throw new Error('Unknown channel kind');
	if (!STATUSES.has(status)) throw new Error('Unknown channel status');
	return {
		key,
		name: name.slice(0, 80),
		kind: kind as MarketingChannel['kind'],
		status: status as MarketingChannel['status'],
		targetCacNgn: optionalInt(input.targetCacNgn),
		dailyCapNgn: optionalInt(input.dailyCapNgn),
		postbackTemplate: validatePostbackTemplate(String(input.postbackTemplate ?? '')),
		dedupByClickId: input.dedupByClickId === true,
		notes:
			String(input.notes ?? '')
				.trim()
				.slice(0, 500) || null
	};
}

type ChannelRow = {
	key: string;
	name: string;
	kind: string;
	status: string;
	target_cac_ngn: number | null;
	daily_cap_ngn: number | null;
	postback_template: string | null;
	dedup_by_click_id: boolean;
	notes: string | null;
};

function fromRow(row: ChannelRow): MarketingChannel {
	return {
		key: row.key,
		name: row.name,
		kind: row.kind as MarketingChannel['kind'],
		status: row.status as MarketingChannel['status'],
		targetCacNgn: row.target_cac_ngn,
		dailyCapNgn: row.daily_cap_ngn,
		postbackTemplate: row.postback_template,
		dedupByClickId: row.dedup_by_click_id,
		notes: row.notes
	};
}

export async function listChannels(): Promise<MarketingChannel[]> {
	const rows = await prisma.$queryRaw<ChannelRow[]>`
		SELECT key, name, kind, status, target_cac_ngn, daily_cap_ngn, postback_template,
			dedup_by_click_id, notes
		FROM marketing_channels ORDER BY name`;
	return rows.map(fromRow);
}

export async function getChannelsByKey(keys: string[]): Promise<Map<string, MarketingChannel>> {
	if (keys.length === 0) return new Map();
	const rows = await prisma.$queryRaw<ChannelRow[]>`
		SELECT key, name, kind, status, target_cac_ngn, daily_cap_ngn, postback_template,
			dedup_by_click_id, notes
		FROM marketing_channels WHERE key = ANY(${keys})`;
	return new Map(rows.map((row) => [row.key, fromRow(row)]));
}

export async function upsertChannel(input: Record<string, unknown>): Promise<MarketingChannel> {
	const channel = normalizeChannelInput(input);
	await prisma.$executeRaw`
		INSERT INTO marketing_channels
			(key, name, kind, status, target_cac_ngn, daily_cap_ngn, postback_template,
			 dedup_by_click_id, notes, updated_at)
		VALUES
			(${channel.key}, ${channel.name}, ${channel.kind}, ${channel.status},
			 ${channel.targetCacNgn}, ${channel.dailyCapNgn}, ${channel.postbackTemplate},
			 ${channel.dedupByClickId}, ${channel.notes}, now())
		ON CONFLICT (key) DO UPDATE SET
			name = EXCLUDED.name,
			kind = EXCLUDED.kind,
			status = EXCLUDED.status,
			target_cac_ngn = EXCLUDED.target_cac_ngn,
			daily_cap_ngn = EXCLUDED.daily_cap_ngn,
			postback_template = EXCLUDED.postback_template,
			dedup_by_click_id = EXCLUDED.dedup_by_click_id,
			notes = EXCLUDED.notes,
			updated_at = now()`;
	return channel;
}
