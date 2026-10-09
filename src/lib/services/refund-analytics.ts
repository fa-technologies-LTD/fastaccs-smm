import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import {
	normalizeGa4OrderClientId,
	readGa4OrderMetadata,
	usesManagedGa4Ecommerce
} from '$lib/server/ga4-order-metadata';
import {
	isGa4MeasurementProtocolConfigured,
	sendGa4MeasurementProtocolEvents
} from '$lib/server/ga4-measurement-protocol';

type Outcome = 'sent' | 'pending' | 'skipped' | 'under_review';
type Dispatch = {
	state: 'sending' | 'sent' | 'under_review';
	token: string;
	beforeKobo: number;
	targetKobo: number;
	startedAt: string;
	reason?: string;
};
const txOptions = { maxWait: 5_000, timeout: 8_000 };
const uncertainAfterMs = 5 * 60_000;

export interface RefundAnalyticsReview {
	id: string;
	orderNumber: string;
	reason: 'delivery_unknown' | 'invalid_reporting_state' | 'canonical_purchase_missing';
}

/** Read-only operational visibility. Never expose tracking IDs or offer a blind resend. */
export async function listRefundAnalyticsReview(limit = 50): Promise<RefundAnalyticsReview[]> {
	const stale = new Date(Date.now() - uncertainAfterMs).toISOString();
	return prisma.$queryRaw<RefundAnalyticsReview[]>`
		SELECT id, order_number AS "orderNumber", CASE
			WHEN analytics_metadata->>'ga4RefundReviewReason' IS NOT NULL THEN 'invalid_reporting_state'
			WHEN analytics_metadata->>'ga4CanonicalPurchaseSentAt' IS NULL THEN 'canonical_purchase_missing'
			ELSE 'delivery_unknown' END AS reason
		FROM orders WHERE refunded_amount > 0
		AND analytics_metadata->>'ga4EcommerceVersion' = '2'
		AND analytics_metadata->>'ga4ConsentGranted' = 'true'
		AND (analytics_metadata->>'ga4RefundReviewReason' IS NOT NULL
			OR analytics_metadata->'ga4RefundDispatch'->>'state' = 'under_review'
			OR (analytics_metadata->'ga4RefundDispatch'->>'state' = 'sending'
				AND analytics_metadata->'ga4RefundDispatch'->>'startedAt' <= ${stale})
			OR (analytics_metadata->>'ga4CanonicalPurchaseSentAt' IS NULL
				AND paid_at IS NOT NULL AND paid_at < NOW() - INTERVAL '72 hours'))
		ORDER BY updated_at, id
		LIMIT ${Math.min(50, Math.max(1, Math.trunc(Number(limit) || 50)))}`;
}

function kobo(value: unknown): number | null {
	const numeric = Number(value);
	const result = Math.round(numeric * 100);
	return Number.isFinite(numeric) &&
		numeric >= 0 &&
		Number.isSafeInteger(result) &&
		result <= 999_999_999_999_999 &&
		Math.abs(numeric * 100 - result) < 0.001
		? result
		: null;
}
function reportedKobo(value: unknown): number | null {
	if (value === undefined) return 0;
	return typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value <= 999_999_999_999_999
		? value
		: null;
}
function readDispatch(value: unknown): Dispatch | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Dispatch;
	return ['sending', 'sent', 'under_review'].includes(row.state) &&
		typeof row.token === 'string' &&
		/^[0-9a-f-]{36}$/i.test(row.token) &&
		reportedKobo(row.beforeKobo) !== null &&
		reportedKobo(row.targetKobo) !== null &&
		row.targetKobo > row.beforeKobo &&
		typeof row.startedAt === 'string' &&
		Number.isFinite(Date.parse(row.startedAt))
		? row
		: null;
}
async function merge(
	tx: Prisma.TransactionClient,
	orderId: string,
	patch: Record<string, unknown>
) {
	const json = JSON.stringify(patch);
	await tx.$executeRaw`UPDATE orders SET analytics_metadata =
		COALESCE(analytics_metadata, '{}'::jsonb) || ${json}::jsonb WHERE id = ${orderId}::uuid`;
}
async function lock(tx: Prisma.TransactionClient, orderId: string) {
	// Same advisory key as purchase reporting; no wallet lock or provider call.
	await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ga4-purchase:${orderId}`}))::text`;
	await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
}

/**
 * The financial refund is already committed. This independently reports only the
 * unreported increment. Commit a dispatch marker BEFORE contacting Google: refunds
 * do not have the same documented purchase-ID dedup guarantee. An ambiguous send
 * or process crash is held for review, never automatically replayed.
 */
export async function sendOrderRefundAnalytics(orderId: string): Promise<Outcome> {
	if (!isGa4MeasurementProtocolConfigured()) return 'skipped';
	const claim = await prisma.$transaction(async (tx) => {
		await lock(tx, orderId);
		const order = await tx.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				totalAmount: true,
				refundedAmount: true,
				currency: true,
				analyticsMetadata: true
			}
		});
		if (!order) return { outcome: 'skipped' as Outcome };
		const metadata = readGa4OrderMetadata(order.analyticsMetadata);
		if (
			!usesManagedGa4Ecommerce(metadata) ||
			typeof metadata.ga4CanonicalPurchaseSentAt !== 'string'
		)
			return { outcome: 'skipped' as Outcome };
		if (metadata.ga4RefundReviewReason) return { outcome: 'under_review' as Outcome };
		const before = reportedKobo(metadata.ga4RefundReportedKobo);
		const target = kobo(order.refundedAmount);
		const gross = kobo(order.totalAmount);
		const previous = readDispatch(metadata.ga4RefundDispatch);
		const corruptDispatch = metadata.ga4RefundDispatch != null && !previous;
		if (
			before === null ||
			target === null ||
			gross === null ||
			target > gross ||
			before > target ||
			corruptDispatch ||
			!/^[A-Z]{3}$/.test(order.currency)
		) {
			await merge(tx, orderId, { ga4RefundReviewReason: 'invalid_reporting_state' });
			return { outcome: 'under_review' as Outcome };
		}
		if (previous?.state === 'under_review') return { outcome: 'under_review' as Outcome };
		if (previous?.state === 'sending') {
			if (Date.now() - Date.parse(previous.startedAt) < uncertainAfterMs)
				return { outcome: 'pending' as Outcome };
			await merge(tx, orderId, {
				ga4RefundDispatch: { ...previous, state: 'under_review', reason: 'delivery_unknown' }
			});
			return { outcome: 'under_review' as Outcome };
		}
		if (previous?.state === 'sent' && previous.targetKobo !== before) {
			await merge(tx, orderId, { ga4RefundReviewReason: 'reported_total_mismatch' });
			return { outcome: 'under_review' as Outcome };
		}
		if (target <= before) return { outcome: 'skipped' as Outcome };
		if (
			typeof metadata.ga4RefundRetryAfter === 'string' &&
			Date.parse(metadata.ga4RefundRetryAfter) > Date.now()
		)
			return { outcome: 'pending' as Outcome };
		const dispatch: Dispatch = {
			state: 'sending',
			token: randomUUID(),
			beforeKobo: before,
			targetKobo: target,
			startedAt: new Date().toISOString()
		};
		await merge(tx, orderId, { ga4RefundDispatch: dispatch });
		return {
			dispatch,
			clientId: normalizeGa4OrderClientId(metadata.ga4ClientId)!,
			currency: order.currency
		};
	}, txOptions);
	if ('outcome' in claim) return claim.outcome!;

	let result;
	try {
		result = await sendGa4MeasurementProtocolEvents({
			clientId: claim.clientId,
			events: [
				{
					name: 'refund',
					params: {
						transaction_id: orderId,
						currency: claim.currency,
						value: (claim.dispatch.targetKobo - claim.dispatch.beforeKobo) / 100
					}
				}
			]
		});
	} catch {
		result = { success: false }; // Unknown remote acceptance, not safe to retry.
	}
	return prisma.$transaction(async (tx): Promise<Outcome> => {
		await lock(tx, orderId);
		const order = await tx.order.findUnique({
			where: { id: orderId },
			select: { analyticsMetadata: true }
		});
		const metadata = readGa4OrderMetadata(order?.analyticsMetadata);
		const current = readDispatch(metadata.ga4RefundDispatch);
		if (!order || current?.token !== claim.dispatch.token || current.state !== 'sending')
			return 'under_review';
		if (reportedKobo(metadata.ga4RefundReportedKobo) !== claim.dispatch.beforeKobo) {
			await merge(tx, orderId, {
				ga4RefundDispatch: { ...current, state: 'under_review', reason: 'reported_total_changed' }
			});
			return 'under_review';
		}
		if (result.success) {
			await merge(tx, orderId, {
				ga4RefundReportedKobo: current.targetKobo,
				ga4RefundDispatch: { ...current, state: 'sent' },
				ga4RefundSentAt: new Date().toISOString(),
				ga4RefundRetryAfter: null
			});
			return 'sent';
		}
		if ('skipped' in result && result.skipped === true) {
			// Transport explicitly proves no HTTP request was made (configuration/input).
			await merge(tx, orderId, {
				ga4RefundDispatch: null,
				ga4RefundRetryAfter: new Date(Date.now() + 5 * 60_000).toISOString()
			});
			return 'pending';
		}
		await merge(tx, orderId, {
			ga4RefundDispatch: { ...current, state: 'under_review', reason: 'delivery_unknown' }
		});
		return 'under_review';
	}, txOptions);
}

export async function drainRefundAnalytics(limit = 3, deadlineMs = Date.now() + 30_000) {
	const summary = { sent: 0, pending: 0, skipped: 0, underReview: 0, failed: 0 };
	if (!isGa4MeasurementProtocolConfigured() || deadlineMs - Date.now() < 25_000) return summary;
	try {
		const now = new Date().toISOString();
		const rows = await prisma.$queryRaw<Array<{ id: string }>>`
			SELECT id FROM orders WHERE refunded_amount > 0
			-- Committed refunds are durable work, including older paid orders.
			-- Do not depend on updated_at: financial refunds need not change it.
			AND analytics_metadata->>'ga4EcommerceVersion' = '2'
			AND analytics_metadata->>'ga4ConsentGranted' = 'true'
			AND analytics_metadata->>'ga4CanonicalPurchaseSentAt' IS NOT NULL
			AND analytics_metadata->>'ga4RefundReviewReason' IS NULL
			AND COALESCE(analytics_metadata->'ga4RefundDispatch'->>'state', '') <> 'under_review'
			AND (analytics_metadata->>'ga4RefundRetryAfter' IS NULL OR analytics_metadata->>'ga4RefundRetryAfter' <= ${now})
			AND (ROUND(refunded_amount * 100) > CASE
				WHEN analytics_metadata->>'ga4RefundReportedKobo' ~ '^[0-9]{1,15}$'
				THEN (analytics_metadata->>'ga4RefundReportedKobo')::bigint ELSE -1 END
				OR analytics_metadata->'ga4RefundDispatch'->>'state' = 'sending')
			ORDER BY updated_at, id LIMIT ${Math.min(10, Math.max(1, Math.trunc(Number(limit) || 3)))}`;
		for (const row of rows) {
			if (deadlineMs - Date.now() < 25_000) break;
			try {
				const outcome = await sendOrderRefundAnalytics(row.id);
				if (outcome === 'under_review') summary.underReview++;
				else summary[outcome]++;
			} catch {
				summary.failed++;
			} // Durable claim prevents ambiguous replay after restart.
		}
	} catch {
		summary.failed++;
	}
	return summary;
}
