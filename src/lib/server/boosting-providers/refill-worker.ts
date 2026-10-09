import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { createBoostOrderClients } from './fulfillment-worker';
import { recordOrderEvent } from '$lib/services/order-events';
import type { BoostProviderOrderClient, BoostRefillState } from './types';

const ACTIONS = ['refill_requested', 'refill_in_progress'];
const MAX_FAILURES = 5;
const include = {
	fulfillment: { include: { orderItem: { include: { order: true } } } }
} satisfies Prisma.BoostComplaintInclude;
type RefillComplaint = Prisma.BoostComplaintGetPayload<{ include: typeof include }>;

function due(now: Date): Prisma.BoostComplaintWhereInput {
	return {
		status: 'escalated',
		type: 'dropped',
		providerAction: { in: ACTIONS },
		supplierCaseId: { not: null },
		fulfillment: { provider: 'bulk_follows' },
		AND: [
			{ OR: [{ refillNextCheckAt: null }, { refillNextCheckAt: { lte: now } }] },
			{ OR: [{ refillLeaseExpiresAt: null }, { refillLeaseExpiresAt: { lt: now } }] }
		]
	};
}

/** Polls only existing refill IDs. Never submits/retries a refill or purchases replacement units. */
export async function runBoostRefillWorker(
	options: {
		database?: PrismaClient;
		client?: BoostProviderOrderClient;
		now?: Date;
		limit?: number;
	} = {}
) {
	const database = options.database ?? prisma;
	const client = options.client ?? createBoostOrderClients().bulk_follows;
	const now = options.now ?? new Date();
	const summary = {
		checked: 0,
		completed: 0,
		needsReview: 0,
		failed: 0,
		skipped: 0,
		uncertainRecovered: 0
	};
	if (!client.getRefillStatus || client.id !== 'bulk_follows') return summary;
	// Each provider read has a 20-second timeout; at most two sequential reads fit this cron.
	const limit = Math.min(2, Math.max(1, Math.floor(options.limit ?? 2)));
	const deadline = Date.now() + 45_000;
	// A process can die after claiming the remote action and before saving its ID. This is
	// deliberately a manual hold, never a timer-based resubmission of the remote refill.
	const uncertain = await database.boostComplaint.updateMany({
		where: {
			status: 'escalating',
			providerAction: 'supplier_action_started',
			updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) }
		},
		data: {
			status: 'escalation_unknown',
			providerAction: 'refill_outcome_unknown',
			refillState: 'unknown',
			refillNextCheckAt: null
		}
	});
	summary.uncertainRecovered = uncertain.count;
	const candidates = await database.boostComplaint.findMany({
		where: due(now),
		include,
		orderBy: [{ refillNextCheckAt: 'asc' }, { escalatedAt: 'asc' }],
		take: limit
	});
	for (const candidate of candidates) {
		if (Date.now() + 22_000 > deadline) break;
		const token = randomUUID();
		const claimed = await database.boostComplaint.updateMany({
			where: { ...due(now), id: candidate.id, updatedAt: candidate.updatedAt },
			data: { refillLeaseToken: token, refillLeaseExpiresAt: new Date(now.getTime() + 120_000) }
		});
		if (!claimed.count) {
			summary.skipped++;
			continue;
		}
		try {
			const paid =
				isOrderPaymentConfirmed(candidate.fulfillment.orderItem.order) &&
				candidate.fulfillment.orderItem.order.deliveryStatus !== 'refunded';
			const result = paid ? await client.getRefillStatus(candidate.supplierCaseId!) : null;
			const state: BoostRefillState = result?.state ?? 'unknown';
			const checkedAt = options.now ?? new Date();
			const outcome = await commitResult(database, candidate, token, state, checkedAt, !paid);
			if (outcome === 'completed') summary.completed++;
			if (outcome === 'review') summary.needsReview++;
			if (outcome === 'skipped') summary.skipped++;
			else if (result) summary.checked++;
		} catch {
			summary.failed++;
			const failures = candidate.refillPollFailures + 1;
			const review = failures >= MAX_FAILURES;
			const changed = await database.boostComplaint.updateMany({
				where: {
					id: candidate.id,
					refillLeaseToken: token,
					status: 'escalated',
					providerAction: { in: ACTIONS },
					supplierCaseId: candidate.supplierCaseId
				},
				data: {
					refillPollFailures: failures,
					refillNextCheckAt: review
						? null
						: new Date(now.getTime() + Math.min(60, 5 * 2 ** (failures - 1)) * 60_000),
					...(review
						? { refillState: 'unknown', providerAction: 'refill_status_review_required' }
						: {})
				}
			});
			if (review && changed.count) summary.needsReview++;
			// Preserve the last successful check; errors are not fresh provider progress.
		} finally {
			await database.boostComplaint.updateMany({
				where: { id: candidate.id, refillLeaseToken: token },
				data: { refillLeaseToken: null, refillLeaseExpiresAt: null }
			});
		}
	}
	return summary;
}

async function commitResult(
	database: PrismaClient,
	candidate: RefillComplaint,
	token: string,
	state: BoostRefillState,
	now: Date,
	paymentHeld: boolean
) {
	return database.$transaction(async (tx) => {
		const orderId = candidate.fulfillment.orderItem.orderId;
		await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
		const current = await tx.boostComplaint.findUnique({ where: { id: candidate.id }, include });
		if (
			!current ||
			current.refillLeaseToken !== token ||
			current.status !== 'escalated' ||
			!ACTIONS.includes(current.providerAction || '') ||
			current.supplierCaseId !== candidate.supplierCaseId
		)
			return 'skipped';
		const order = current.fulfillment.orderItem.order;
		if (paymentHeld || !isOrderPaymentConfirmed(order) || order.deliveryStatus === 'refunded') {
			await tx.boostComplaint.updateMany({
				where: { id: current.id, refillLeaseToken: token },
				data: {
					providerAction: 'refill_after_order_hold',
					refillState: 'unknown',
					refillNextCheckAt: null
				}
			});
			return 'review';
		}
		const failures = state === 'unknown' ? current.refillPollFailures + 1 : 0;
		const review = state === 'rejected' || (state === 'unknown' && failures >= MAX_FAILURES);
		const completed = state === 'completed';
		const changed = await tx.boostComplaint.updateMany({
			where: { id: current.id, status: 'escalated', refillLeaseToken: token },
			data: {
				refillState: state,
				refillCheckedAt: now,
				refillPollFailures: failures,
				providerAction: completed
					? 'refill_completed'
					: state === 'rejected'
						? 'refill_rejected'
						: review
							? 'refill_status_review_required'
							: state === 'in_progress'
								? 'refill_in_progress'
								: 'refill_requested',
				refillNextCheckAt: completed || review ? null : new Date(now.getTime() + 5 * 60_000),
				...(completed ? { status: 'resolved', resolvedAt: now } : {})
			}
		});
		if (!changed.count) return 'skipped';
		if (completed || review) {
			await recordOrderEvent(
				{
					orderId,
					orderItemId: current.fulfillment.orderItemId,
					type: completed ? 'boosting_refill_completed' : 'boosting_refill_review_required',
					source: 'boosting.refill-poll',
					idempotencyKey: `boosting:refill:${current.id}:${completed ? 'completed' : 'review'}`,
					metadata: { complaintId: current.id, state }
				},
				tx
			);
			if (current.userId)
				await tx.notification.create({
					data: {
						userId: current.userId,
						type: 'boosting_issue',
						orderId,
						title: completed ? 'Refill complete' : 'Refill needs review',
						message: completed
							? 'The supplier reports your refill is complete. Check your result here.'
							: 'Your refill needs a support check. You do not need to order again.'
					}
				});
		}
		return completed ? 'completed' : review ? 'review' : 'checked';
	});
}
