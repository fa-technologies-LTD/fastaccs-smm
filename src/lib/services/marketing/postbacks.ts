import { prisma } from '$lib/prisma';
import { sendPostbackRequest, type PostbackRequestResult } from '$lib/server/safe-postback-request';
import { assertPostbackUrlAllowed, channelReportsConversions, renderPostback } from './channels';
import { DEFAULT_USD_NGN_RATE, getMarketingUsdNgnRate } from './fx';

/**
 * Conversion postbacks: tell an ad network "this click bought", so its bidding optimizes toward
 * buyers. Best-effort and never in the money path.
 *
 * Safety rules (agreed with the payments owner):
 * - Only orders whose consented last touch carries a network click id (T1 snapshot; the ad-click
 *   cookie is only honoured with marketing consent).
 * - Eligibility = canonical sale: paid, not refunded (any amount), not cancelled, not an owner
 *   self-offload (payment_channel 'manual_release'). Checked in selection, under a ROW LOCK
 *   (`FOR UPDATE`, which serializes against refund/cancel writers) when claiming, and once more
 *   right before the HTTP request.
 *   Eligibility point: `finalPreSendCheck`, immediately before the HTTP request, which re-reads
 *   the order AND the channel's current status/URL/dedup setting. Only a refund or channel stop
 *   that commits AFTER that read (milliseconds before the request) can still be reported; networks
 *   have no negative conversions, so that residual window is accepted and documented.
 * - Channel must still report conversions (not "Stopped"), and its URL must pass the trusted-host
 *   check at send time; scheduled AND admin sends both enforce this.
 * - A timeout can arrive after the network accepted the conversion. "Uncertain" outcomes are
 *   retried only for channels whose click-id dedup is confirmed; otherwise held for review.
 * - Redirects are never followed; unsafe addresses are refused at connect time.
 * - Metadata is JSON-merged so other workflows' keys (GA4 markers) are never erased.
 *
 * Two-phase: claim ("sending") → HTTP → record. A crash between send and record leaves a stale
 * "sending" claim, which is uncertain by definition and is moved to "held".
 */

export type PostbackState =
	| 'sending'
	| 'sent'
	| 'rejected'
	| 'retry'
	| 'held'
	| 'skipped'
	| 'discarded';

export const POSTBACK_WINDOW_HOURS = 72;
const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 10 * 60_000;

// Failures where the request provably never reached the network: safe to retry anywhere.
const NEVER_SENT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);

export interface PostbackOutcome {
	state: 'sent' | 'rejected' | 'retry' | 'held';
	reason: string;
}

function errorCode(error: unknown): string {
	const cause = (error as { cause?: { code?: unknown } })?.cause;
	return String((error as { code?: unknown })?.code ?? cause?.code ?? '');
}

/** Map an HTTP result or transport error to the next state. Pure. */
export function classifyPostbackResult(
	result: PostbackRequestResult,
	opts: { dedupByClickId: boolean; attempts: number }
): PostbackOutcome {
	const exhausted = opts.attempts >= MAX_ATTEMPTS;

	if ('status' in result) {
		const { status } = result;
		if (status >= 200 && status < 300) return { state: 'sent', reason: `HTTP ${status}` };
		if (status >= 300 && status < 400) {
			return { state: 'rejected', reason: `HTTP ${status}: redirect not followed` };
		}
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
	if (code === 'EUNSAFEADDR') {
		return { state: 'rejected', reason: 'Blocked: network host resolved to a non-public address' };
	}
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

type OrderRow = {
	status: string;
	payment_status: string;
	delivery_status: string;
	payment_channel: string | null;
	total_amount: unknown;
	refunded_amount: unknown;
	analytics_metadata: Record<string, unknown> | null;
};

/** Canonical sale for conversion reporting (mirrors the revenue helpers + any refund excluded). */
export function isConversionEligible(order: OrderRow): boolean {
	const paid =
		order.status === 'paid' || order.status === 'completed' || order.payment_status === 'paid';
	const refunded =
		[order.status, order.payment_status, order.delivery_status].includes('refunded') ||
		Number(order.refunded_amount) > 0;
	return (
		paid && !refunded && order.status !== 'cancelled' && order.payment_channel !== 'manual_release'
	);
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

type Claim =
	| {
			kind: 'claimed';
			orderId: string;
			channelKey: string;
			clickId: string;
			netNgn: number;
			attempts: number;
	  }
	| { kind: 'ineligible' }
	| { kind: 'stopped' }
	| { kind: 'misconfigured'; reason: string };

/** Phase A: row-lock the order, re-check eligibility and channel, mark "sending". */
async function claim(orderId: string, now: Date, force: boolean): Promise<Claim> {
	return prisma.$transaction(
		async (tx) => {
			const rows = await tx.$queryRaw<OrderRow[]>`
				SELECT status, payment_status, delivery_status, payment_channel, total_amount,
					refunded_amount, analytics_metadata
				FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
			const order = rows[0];
			if (!order || !isConversionEligible(order)) return { kind: 'ineligible' };

			const meta = order.analytics_metadata ?? {};
			const state = meta.adPostbackState as PostbackState | undefined;
			const retryDue =
				state === 'retry' && Date.parse(String(meta.adPostbackRetryAfter ?? '')) <= now.getTime();
			const allowed = force ? state === 'held' : state === undefined || retryDue;
			if (!allowed) return { kind: 'ineligible' };

			const last = ((meta.attribution as Record<string, unknown> | undefined)?.last ??
				{}) as Record<string, unknown>;
			const clickId = String(last.clickId ?? '');
			const channelKey = String(last.source ?? '').toLowerCase();
			if (!clickId || !channelKey) return { kind: 'ineligible' };

			const channels = await tx.$queryRaw<
				Array<{ status: string; postback_template: string | null }>
			>`SELECT status, postback_template FROM marketing_channels WHERE key = ${channelKey}`;
			const channel = channels[0];
			if (!channel || !channelReportsConversions(channel.status)) {
				await mergeMetadata(tx, orderId, {
					adPostbackState: 'skipped',
					adPostbackLastResult: 'Channel stopped: conversions are not reported'
				});
				return { kind: 'stopped' };
			}
			try {
				assertPostbackUrlAllowed(String(channel.postback_template ?? ''), channelKey);
			} catch (error) {
				const reason = `Postback URL not allowed: ${(error as Error).message}`;
				await mergeMetadata(tx, orderId, { adPostbackState: 'held', adPostbackLastResult: reason });
				return { kind: 'misconfigured', reason };
			}

			const attempts = Math.min(Number(meta.adPostbackAttempts) || 0, 20) + 1;
			await mergeMetadata(tx, orderId, {
				adPostbackState: 'sending',
				adPostbackClaimedAt: now.toISOString(),
				adPostbackAttempts: attempts,
				adPostbackChannel: channelKey
			});
			return {
				kind: 'claimed',
				orderId,
				channelKey,
				clickId,
				netNgn: Number(order.total_amount),
				attempts
			};
		},
		{ maxWait: 10_000, timeout: 15_000 }
	);
}

type FinalCheck =
	| { kind: 'ok'; template: string; dedupByClickId: boolean }
	| { kind: 'ineligible' }
	| { kind: 'stopped' }
	| { kind: 'misconfigured'; reason: string };

/**
 * The eligibility point: last check before the HTTP request, re-reading BOTH the order and the
 * channel's CURRENT status, URL and dedup setting (nothing cached from the claim is trusted).
 */
async function finalPreSendCheck(orderId: string, channelKey: string): Promise<FinalCheck> {
	const [orders, channels] = await Promise.all([
		prisma.$queryRaw<OrderRow[]>`
			SELECT status, payment_status, delivery_status, payment_channel, total_amount,
				refunded_amount, analytics_metadata
			FROM orders WHERE id = ${orderId}::uuid`,
		prisma.$queryRaw<
			Array<{ status: string; postback_template: string | null; dedup_by_click_id: boolean }>
		>`SELECT status, postback_template, dedup_by_click_id FROM marketing_channels
			WHERE key = ${channelKey}`
	]);
	if (!orders[0] || !isConversionEligible(orders[0])) return { kind: 'ineligible' };
	const channel = channels[0];
	if (!channel || !channelReportsConversions(channel.status)) return { kind: 'stopped' };
	try {
		return {
			kind: 'ok',
			template: assertPostbackUrlAllowed(String(channel.postback_template ?? ''), channelKey),
			dedupByClickId: channel.dedup_by_click_id
		};
	} catch (error) {
		return {
			kind: 'misconfigured',
			reason: `Postback URL not allowed: ${(error as Error).message}`
		};
	}
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
	skipped: number;
	stopped: number;
	staleHeld: number;
}

export async function dispatchAdPostbacks(
	options: {
		limit?: number;
		now?: Date;
		send?: (url: string) => Promise<PostbackRequestResult>;
		orderIds?: string[]; // admin "send held postback": exact orders, forced from "held"
	} = {}
): Promise<DispatchSummary> {
	const now = options.now ?? new Date();
	const send = options.send ?? ((url: string) => sendPostbackRequest(url));
	const force = Boolean(options.orderIds?.length);
	const summary: DispatchSummary = {
		examined: 0,
		sent: 0,
		retry: 0,
		held: 0,
		rejected: 0,
		skipped: 0,
		stopped: 0,
		staleHeld: 0
	};

	if (!force) summary.staleHeld = await holdStaleClaims(now);

	const since = new Date(now.getTime() - POSTBACK_WINDOW_HOURS * 3_600_000);
	const candidates = force
		? options.orderIds!.map((id) => ({ id }))
		: await prisma.$queryRaw<Array<{ id: string }>>`
			SELECT o.id FROM orders o
			JOIN marketing_channels c
				ON c.key = lower(o.analytics_metadata->'attribution'->'last'->>'source')
				AND c.postback_template IS NOT NULL
				AND c.status IN ('testing', 'scaling', 'paused')
			WHERE coalesce(o.paid_at, o.created_at) >= ${since}
				AND (o.status IN ('paid', 'completed') OR o.payment_status = 'paid')
				AND o.status NOT IN ('refunded', 'cancelled')
				AND o.payment_status <> 'refunded' AND o.delivery_status <> 'refunded'
				AND coalesce(o.refunded_amount, 0) = 0
				AND (o.payment_channel IS NULL OR o.payment_channel <> 'manual_release')
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
		if (claimed.kind === 'stopped') {
			summary.stopped += 1;
			continue;
		}
		if (claimed.kind === 'misconfigured') {
			summary.held += 1;
			continue;
		}
		if (claimed.kind !== 'claimed') continue;

		const final = await finalPreSendCheck(id, claimed.channelKey);
		if (final.kind === 'ineligible') {
			await mergeMetadata(prisma, id, {
				adPostbackState: 'skipped',
				adPostbackLastResult: 'Refunded or cancelled before sending'
			});
			summary.skipped += 1;
			continue;
		}
		if (final.kind === 'stopped') {
			await mergeMetadata(prisma, id, {
				adPostbackState: 'skipped',
				adPostbackLastResult: 'Channel stopped before sending: conversions are not reported'
			});
			summary.stopped += 1;
			continue;
		}
		if (final.kind === 'misconfigured') {
			await mergeMetadata(prisma, id, {
				adPostbackState: 'held',
				adPostbackLastResult: final.reason.slice(0, 160)
			});
			summary.held += 1;
			continue;
		}

		let url: string;
		try {
			url = assertPostbackUrlAllowed(
				renderPostback(final.template, {
					clickId: claimed.clickId,
					payoutUsd: payoutUsd(claimed.netNgn, rate)
				}),
				claimed.channelKey
			);
		} catch (error) {
			await mergeMetadata(prisma, id, {
				adPostbackState: 'rejected',
				adPostbackLastResult: `Postback URL not allowed: ${(error as Error).message}`.slice(0, 160)
			});
			summary.rejected += 1;
			continue;
		}
		const result = await send(url);

		const outcome = classifyPostbackResult(result, {
			dedupByClickId: final.dedupByClickId,
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
