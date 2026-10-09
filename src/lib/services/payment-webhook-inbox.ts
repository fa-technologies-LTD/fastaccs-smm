import { createHash, randomUUID } from 'crypto';
import { prisma } from '$lib/prisma';
import { processMonnifyWebhookEvent } from './monnify-webhook-processing';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';

type WebhookPayload = { eventType: string; eventData: Record<string, string> };

/** Store only routing fields, not the gateway's customer/bank payload. Called AFTER signature verification. */
export function normalizeWebhookPayload(body: unknown): WebhookPayload {
	if (!body || typeof body !== 'object') throw new Error('INVALID_WEBHOOK');
	const event = body as Record<string, unknown>;
	if (typeof event.eventType !== 'string' || event.eventType.length > 100)
		throw new Error('INVALID_WEBHOOK');
	const data =
		event.eventData && typeof event.eventData === 'object'
			? (event.eventData as Record<string, unknown>)
			: {};
	const eventData: Record<string, string> = {};
	for (const key of ['transactionReference', 'paymentReference', 'paymentStatus']) {
		if (typeof data[key] === 'string') {
			if (data[key].length > 500) throw new Error('INVALID_WEBHOOK');
			eventData[key] = data[key].trim();
		}
	}
	return { eventType: event.eventType.trim(), eventData };
}

export async function receivePaymentWebhook(payload: WebhookPayload): Promise<string> {
	const eventKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
	await prisma.paymentWebhookInbox.upsert({
		where: { eventKey },
		update: {},
		create: { eventKey, payload }
	});
	return eventKey;
}

/** Leased retry worker; a crash leaves work discoverable after its lease expires. */
export async function drainPaymentWebhookInbox(
	limit = 20,
	eventKey?: string
): Promise<{ processed: number; retried: number; quarantined: number }> {
	const now = new Date();
	const deadline = Date.now() + 40_000;
	const rows = await prisma.paymentWebhookInbox.findMany({
		where: {
			...(eventKey ? { eventKey } : {}),
			OR: [
				{ status: 'pending', nextAttemptAt: { lte: now } },
				{ status: 'processing', leaseExpiresAt: { lte: now } }
			]
		},
		orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
		take: Math.min(25, Math.max(1, Math.floor(limit)))
	});
	const summary = { processed: 0, retried: 0, quarantined: 0 };
	for (const row of rows) {
		if (Date.now() >= deadline) break;
		const leaseExpiresAt = new Date(Date.now() + 5 * 60_000);
		const claimed = await prisma.paymentWebhookInbox.updateMany({
			where: {
				id: row.id,
				status: row.status,
				attempts: row.attempts,
				leaseExpiresAt: row.leaseExpiresAt
			},
			data: { status: 'processing', attempts: { increment: 1 }, leaseExpiresAt }
		});
		if (!claimed.count) continue;
		let retry = true;
		let permanent = false;
		try {
			const response = await processMonnifyWebhookEvent(
				normalizeWebhookPayload(row.payload),
				randomUUID()
			);
			const result = await response.json();
			retry = response.status >= 500 || response.status === 429;
			permanent = !retry && result.success !== true;
		} catch {
			// Connection/processing errors retry without persisting sensitive exception text.
		}
		const exhausted = row.attempts + 1 >= 12;
		const quarantined = permanent || (retry && exhausted);
		const status = quarantined ? 'quarantined' : retry ? 'pending' : 'processed';
		const finished = await prisma.paymentWebhookInbox.updateMany({
			where: { id: row.id, status: 'processing', leaseExpiresAt },
			data: {
				status,
				leaseExpiresAt: null,
				nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** Math.min(row.attempts, 5)) * 60_000),
				processedAt: status === 'processed' ? new Date() : null,
				lastError: quarantined
					? 'requires_manual_review'
					: retry
						? 'temporary_processing_failure'
						: null
			}
		});
		if (!finished.count) continue;
		if (quarantined) {
			summary.quarantined += 1;
			await sendCriticalAdminAlert({
				title: 'Payment webhook needs review',
				message: `Webhook inbox ${row.id} could not safely finish. Check its order/payment before releasing delivery.`,
				source: 'payments.webhook-inbox',
				dedupeKey: `webhook-inbox:${row.id}`
			}).catch(() => {});
		} else if (retry) summary.retried += 1;
		else summary.processed += 1;
	}
	return summary;
}
