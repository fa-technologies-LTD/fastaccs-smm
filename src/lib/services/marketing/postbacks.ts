import { prisma } from '$lib/prisma';
import { getChannelsByKey, renderPostback } from './channels';
import { DEFAULT_USD_NGN_RATE, getMarketingUsdNgnRate } from './fx';

/**
 * Conversion postbacks: tell an ad network "this click bought", so its bidding optimizes toward
 * buyers. Best-effort and never in the money path.
 *
 * Safety rules (agreed with the payments owner):
 * - Only orders whose last touch carries a network click id. That cookie is only ever set with
 *   marketing consent, so no consent means no click id means no postback.
 * - Eligibility (paid, not refunded, not cancelled) is re-checked under a per-order lock right
 *   before sending.
 * - A timeout can arrive after the network accepted the conversion. Such "uncertain" outcomes are
 *   retried only for channels whose dedup-by-click-id is confirmed; otherwise held for review.
 * - Metadata is JSON-merged so other workflows' keys (GA4 markers) are never erased.
 *
 * Two-phase: claim (state "sending") → HTTP → record. A crash between send and record leaves a
 * stale "sending" claim, which is uncertain by definition and is moved to "held".
 */

export type PostbackState = 'sending' | 'sent' | 'rejected' | 'retry' | 'held' | 'discarded';

export const POSTBACK_WINDOW_HOURS = 72;
const MAX_ATTEMPTS = 5;
const SEND_TIMEOUT_MS = 5_000;
const STALE_CLAIM_MS = 10 * 60_000;

// Failures where the request provably never reached the network: safe to retry anywhere.
const NEVER_SENT_CODES = new Set([
	'ENOTFOUND',
	'EAI_AGAIN',
	'ECONNREFUSED',
	'UND_ERR_CONNECT_TIMEOUT'
]);

export interface PostbackOutcome {
	state: 'sent' | 'rejected' | 'retry' | 'held';
	reason: string;
}

function errorCode(error: unknown): string {
	const cause = (error as { cause?: { code?: unknown } })?.cause;
	return String(cause?.code ?? (error as { code?: unknown })?.code ?? '');
}

/** Map an HTTP result or transport error to the next state. Pure. */
export function classifyPostbackResult(
	result: { status: number } | { error: unknown },
	opts: { dedupByClickId: boolean; attempts: number }
): PostbackOutcome {
	const exhausted = opts.attempts >= MAX_ATTEMPTS;

	if ('status' in result) {
		const { status } = result;
		if (status >= 200 && status < 300) return { state: 'sent', reason: `HTTP ${status}` };
		if (status === 429) {
			// Rate limited: the conversion was not processed.
			return exhausted
				? { state: 'held', reason: 'Rate limited; attempts exhausted' }
				: { state: 'retry', reason: 'HTTP 429' };
		}
		if (status >= 400 && status < 500) return { state: 'rejected', reason: `HTTP ${status}` };
		// 5xx: the network received it and may have recorded it.
		return opts.dedupByClickId && !exhausted
			? { state: 'retry', reason: `HTTP ${status} (network dedups)` }
			: { state: 'held', reason: `HTTP ${status}: may have been recorded` };
	}

	const code = errorCode(result.error);
	if (NEVER_SENT_CODES.has(code)) {
		return exhausted
			? { state: 'held', reason: `${code}; attempts exhausted` }
			: { state: 'retry', reason: `${code} (never reached the network)` };
	}
	const label = code || (result.error instanceof Error ? result.error.name : 'Error');
	return opts.dedupByClickId && !exhausted
		? { state: 'retry', reason: `${label} (network dedups)` }
		: { state: 'held', reason: `${label}: may have been recorded` };
}

/** Backoff after attempt N: 5, 10, 20, 40 … minutes, capped at 6 hours (same curve as GA4). */
export function nextRetryAt(attempts: number, now: Date): Date {
	const minutes = Math.min(360, 5 * 2 ** Math.min(Math.max(attempts, 1) - 1, 7));
	return new Date(now.getTime() + minutes * 60_000);
}

export function payoutUsd(netNgn: number, usdNgnRate: number): number {
	const rate = usdNgnRate > 0 ? usdNgnRate : DEFAULT_USD_NGN_RATE;
	return Math.max(0, Math.round((netNgn / rate) * 100) / 100);
}

async function mergeMetadata(
	db: Pick<typeof prisma, '$executeRaw'>,
	orderId: string,
	patch: Record<string, unknown>
): Promise<void> {
	const json = JSON.stringify(patch);
	await db.$executeRaw`UPDATE orders SET analytics_metadata =
		COALESCE(analytics_metadata, '{}'::jsonb) || ${json}::jsonb WHERE id = ${orderId}::uuid`;
}

type Claim = {
	orderId: string;
	channelKey: string;
	clickId: string;
	netNgn: number;
	attempts: number;
};

/** Phase A: lock, re-check eligibility, mark "sending". Null when no longer eligible. */
async function claim(orderId: string, now: Date, force: boolean): Promise<Claim | null> {
	return prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`marketing-postback:${orderId}`}))::text`;
			const rows = await tx.$queryRaw<
				Array<{
					status: string;
					payment_status: string;
					delivery_status: string;
					total_amount: unknown;
					refunded_amount: unknown;
					analytics_metadata: Record<string, unknown> | null;
				}>
			>`SELECT status, payment_status, delivery_status, total_amount, refunded_amount,
				analytics_metadata FROM orders WHERE id = ${orderId}::uuid`;
			const order = rows[0];
			if (!order) return null;

			const paid =
				order.status === 'paid' || order.status === 'completed' || order.payment_status === 'paid';
			const refunded =
				[order.status, order.payment_status, order.delivery_status].includes('refunded') ||
				Number(order.refunded_amount) > 0;
			if (!paid || refunded || order.status === 'cancelled') return null;

			const meta = order.analytics_metadata ?? {};
			const state = meta.adPostbackState as PostbackState | undefined;
			const retryDue =
				state === 'retry' && Date.parse(String(meta.adPostbackRetryAfter ?? '')) <= now.getTime();
			const allowed = force ? state === 'held' : state === undefined || retryDue;
			if (!allowed) return null;

			const last = ((meta.attribution as Record<string, unknown> | undefined)?.last ??
				{}) as Record<string, unknown>;
			const clickId = String(last.clickId ?? '');
			const channelKey = String(last.source ?? '');
			if (!clickId || !channelKey) return null;

			const attempts = Math.min(Number(meta.adPostbackAttempts) || 0, 20) + 1;
			await mergeMetadata(tx, orderId, {
				adPostbackState: 'sending',
				adPostbackClaimedAt: now.toISOString(),
				adPostbackAttempts: attempts,
				adPostbackChannel: channelKey
			});
			return {
				orderId,
				channelKey,
				clickId,
				netNgn: Number(order.total_amount) - Number(order.refunded_amount || 0),
				attempts
			};
		},
		{ maxWait: 10_000, timeout: 15_000 }
	);
}

/** Claims older than the stale window may have been sent: hold them for review. */
async function holdStaleClaims(now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
	const patch = JSON.stringify({
		adPostbackState: 'held',
		adPostbackLastResult: 'Interrupted while sending: may have been recorded'
	});
	return prisma.$executeRaw`UPDATE orders SET analytics_metadata =
		COALESCE(analytics_metadata, '{}'::jsonb) || ${patch}::jsonb
		WHERE analytics_metadata->>'adPostbackState' = 'sending'
			AND analytics_metadata->>'adPostbackClaimedAt' < ${cutoff}`;
}

export interface DispatchSummary {
	examined: number;
	sent: number;
	retry: number;
	held: number;
	rejected: number;
	staleHeld: number;
}

export async function dispatchAdPostbacks(
	options: {
		limit?: number;
		now?: Date;
		fetchImpl?: typeof fetch;
		orderIds?: string[]; // admin "send held postback": exact orders, forced from "held"
	} = {}
): Promise<DispatchSummary> {
	const now = options.now ?? new Date();
	const fetchImpl = options.fetchImpl ?? fetch;
	const force = Boolean(options.orderIds?.length);
	const summary: DispatchSummary = {
		examined: 0,
		sent: 0,
		retry: 0,
		held: 0,
		rejected: 0,
		staleHeld: 0
	};

	if (!force) summary.staleHeld = await holdStaleClaims(now);

	const since = new Date(now.getTime() - POSTBACK_WINDOW_HOURS * 3_600_000);
	const candidates = force
		? options.orderIds!.map((id) => ({ id }))
		: await prisma.$queryRaw<Array<{ id: string }>>`
			SELECT o.id FROM orders o
			JOIN marketing_channels c
				ON c.key = o.analytics_metadata->'attribution'->'last'->>'source'
				AND c.postback_template IS NOT NULL AND c.status <> 'killed'
			WHERE coalesce(o.paid_at, o.created_at) >= ${since}
				AND (o.status IN ('paid', 'completed') OR o.payment_status = 'paid')
				AND o.status NOT IN ('refunded', 'cancelled')
				AND o.payment_status <> 'refunded' AND o.delivery_status <> 'refunded'
				AND coalesce(o.refunded_amount, 0) = 0
				AND coalesce(o.analytics_metadata->'attribution'->'last'->>'clickId', '') <> ''
				AND (o.analytics_metadata->>'adPostbackState' IS NULL
					OR (o.analytics_metadata->>'adPostbackState' = 'retry'
						AND o.analytics_metadata->>'adPostbackRetryAfter' <= ${now.toISOString()}))
			ORDER BY coalesce(o.paid_at, o.created_at)
			LIMIT ${Math.max(1, Math.min(options.limit ?? 20, 100))}`;
	if (candidates.length === 0) return summary;

	const rate = await getMarketingUsdNgnRate();
	for (const { id } of candidates) {
		summary.examined += 1;
		const claimed = await claim(id, now, force);
		if (!claimed) continue;

		const channel = (await getChannelsByKey([claimed.channelKey])).get(claimed.channelKey);
		if (!channel?.postbackTemplate) {
			await mergeMetadata(prisma, id, {
				adPostbackState: 'held',
				adPostbackLastResult: 'No postback URL configured for this channel'
			});
			summary.held += 1;
			continue;
		}

		const url = renderPostback(channel.postbackTemplate, {
			clickId: claimed.clickId,
			payoutUsd: payoutUsd(claimed.netNgn, rate)
		});
		let result: { status: number } | { error: unknown };
		try {
			const response = await fetchImpl(url, {
				method: 'GET',
				redirect: 'follow',
				signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
			});
			result = { status: response.status };
		} catch (error) {
			result = { error };
		}

		const outcome = classifyPostbackResult(result, {
			dedupByClickId: channel.dedupByClickId,
			attempts: claimed.attempts
		});
		await mergeMetadata(prisma, id, {
			adPostbackState: outcome.state,
			adPostbackLastResult: outcome.reason.slice(0, 160),
			adPostbackRetryAfter:
				outcome.state === 'retry' ? nextRetryAt(claimed.attempts, now).toISOString() : null,
			...(outcome.state === 'sent' ? { adPostbackSentAt: new Date().toISOString() } : {})
		});
		summary[outcome.state] += 1;
	}
	return summary;
}

/** Admin decision on a held postback: discard it (never send). Sending uses dispatchAdPostbacks. */
export async function discardHeldPostback(orderId: string, actor: string): Promise<boolean> {
	const patch = JSON.stringify({ adPostbackState: 'discarded', adPostbackDiscardedBy: actor });
	const changed = await prisma.$executeRaw`UPDATE orders SET analytics_metadata =
		COALESCE(analytics_metadata, '{}'::jsonb) || ${patch}::jsonb
		WHERE id = ${orderId}::uuid AND analytics_metadata->>'adPostbackState' = 'held'`;
	return changed > 0;
}
