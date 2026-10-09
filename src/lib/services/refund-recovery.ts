import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { maybeVoidSuperActivationOnRefund, reconcileAffiliateSales } from './affiliate';
import {
	voidUnvestedRewardsForOrder,
	reverseVestedRegularRewardForOrder,
	reconcileRegularRewardForOrder
} from './affiliate-vesting';
import { maybeClawbackSpendMilestones } from './spend-milestones';
import { sendCriticalAdminAlert } from './admin-alerts';

/** Must commit in the SAME transaction as the refund. A repeated request never resets work. */
export async function enqueueRefundRecovery(
	tx: Prisma.TransactionClient,
	orderId: string,
	eventKey: string
) {
	await tx.refundRecoveryTask.upsert({
		where: { eventKey },
		update: {},
		create: { orderId, eventKey }
	});
}

export async function drainRefundRecovery(limit = 10, deadlineMs = Date.now() + 40_000) {
	const now = new Date();
	const rows = await prisma.refundRecoveryTask.findMany({
		where: {
			OR: [
				{ status: 'pending', nextAttemptAt: { lte: now } },
				{ status: 'processing', leaseExpiresAt: { lte: now } }
			]
		},
		orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
		take: Math.min(25, Math.max(1, limit))
	});
	const summary = { completed: 0, retried: 0 };
	for (const row of rows) {
		if (Date.now() >= deadlineMs) break;
		const leaseExpiresAt = new Date(Date.now() + 5 * 60_000);
		const claim = await prisma.refundRecoveryTask.updateMany({
			where: {
				id: row.id,
				status: row.status,
				attempts: row.attempts,
				leaseExpiresAt: row.leaseExpiresAt
			},
			data: { status: 'processing', attempts: { increment: 1 }, leaseExpiresAt }
		});
		if (!claim.count) continue;
		let completed = false;
		try {
			const order = await prisma.order.findUnique({
				where: { id: row.orderId },
				select: {
					id: true,
					userId: true,
					affiliateUserId: true,
					status: true,
					paymentStatus: true,
					deliveryStatus: true,
					refundedAmount: true
				}
			});
			if (!order || Number(order.refundedAmount) <= 0) throw new Error('REFUND_TARGET_INVALID');
			await maybeVoidSuperActivationOnRefund({
				userId: order.userId,
				affiliateUserId: order.affiliateUserId
			});
			await reconcileAffiliateSales(order.affiliateUserId);
			if (
				order.status === 'refunded' ||
				order.paymentStatus === 'refunded' ||
				order.deliveryStatus === 'refunded'
			) {
				await voidUnvestedRewardsForOrder(order.id);
				await reverseVestedRegularRewardForOrder(order.id);
			} else await reconcileRegularRewardForOrder(order.id);
			if (order.userId) await maybeClawbackSpendMilestones(order.userId, { throwOnError: true });
			completed = true;
		} catch {
			// Existing reward operations are idempotent; retry ALL obligations if any fail.
		}
		const finished = await prisma.refundRecoveryTask.updateMany({
			where: { id: row.id, status: 'processing', leaseExpiresAt },
			data: {
				status: completed ? 'completed' : 'pending',
				leaseExpiresAt: null,
				completedAt: completed ? new Date() : null,
				nextAttemptAt: new Date(Date.now() + Math.min(360, 2 ** Math.min(row.attempts, 8)) * 60_000)
			}
		});
		if (!finished.count) continue;
		if (completed) summary.completed++;
		else {
			summary.retried++;
			if (row.attempts >= 5)
				await sendCriticalAdminAlert({
					title: 'Refund accounting needs review',
					message: `Refund recovery for order ${row.orderId} is still retrying. Buyer credit is already committed; review the outstanding reward reversals.`,
					source: 'refund.recovery',
					dedupeKey: `refund-recovery:${row.id}`
				}).catch(() => {});
		}
	}
	return summary;
}
