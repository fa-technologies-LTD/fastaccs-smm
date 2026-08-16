import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { creditStoreCredit, SC_CREDIT_REFUND } from '$lib/services/store-credit';
import { maybeVoidSuperActivationOnRefund } from '$lib/services/affiliate';
import {
	voidUnvestedRewardsForOrder,
	reverseVestedRegularRewardForOrder
} from '$lib/services/affiliate-vesting';
import { maybeClawbackSpendMilestones } from '$lib/services/spend-milestones';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST /api/orders/[id]/refund
// Cancel-with-refund: return the paid amount to the buyer as (spend-only) Store
// Credit, mark the order refunded, and log it. Available to any admin with
// orders:manage (includes the assistant). Only refunds money that was received.
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const orderId = String(params.id || '').trim();
	if (!isUuid(orderId)) return json({ error: 'Invalid order ID' }, { status: 400 });

	const result = await prisma.$transaction(async (tx) => {
		// Full-order and per-account refunds share this order lock. That prevents two
		// admins from refunding overlapping value from different screens at the same time.
		await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
		const order = await tx.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				orderNumber: true,
				userId: true,
				affiliateUserId: true,
				totalAmount: true,
				paymentStatus: true,
				status: true
			}
		});
		if (!order) return { outcome: 'not_found' as const };

		const totalAmount = Math.floor(Number(order.totalAmount || 0));
		if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
			return { outcome: 'already_refunded' as const, order, amount: totalAmount };
		}

		const wasPaid =
			order.paymentStatus === 'paid' || order.status === 'paid' || order.status === 'completed';
		if (!wasPaid) return { outcome: 'not_paid' as const };
		if (!order.userId) return { outcome: 'guest' as const };
		if (totalAmount <= 0) return { outcome: 'no_amount' as const };

		// If individual faulty accounts were already refunded, refund only the remainder.
		// This lets admins finish a partial refund safely without paying the same units twice.
		const priorRefunds = await tx.walletTransaction.aggregate({
			where: {
				userId: order.userId,
				type: SC_CREDIT_REFUND,
				status: { notIn: ['failed', 'reversed', 'cancelled'] },
				metadata: { path: ['orderId'], equals: order.id }
			},
			_sum: { amount: true }
		});
		const alreadyCredited = Math.max(0, Math.floor(Number(priorRefunds._sum.amount || 0)));
		const amount = Math.max(0, totalAmount - alreadyCredited);

		if (amount > 0) {
			await creditStoreCredit(tx, {
				userId: order.userId,
				amount,
				type: SC_CREDIT_REFUND,
				description: `Refund for order ${order.orderNumber}`,
				reference: order.id,
				metadata: {
					orderId: order.id,
					orderNumber: order.orderNumber,
					kind: 'order_refund',
					priorPartialRefunds: alreadyCredited
				}
			});
		}
		await tx.order.update({
			where: { id: order.id },
			data: { status: 'refunded', paymentStatus: 'refunded' }
		});
		return { outcome: 'refunded' as const, order, amount, alreadyCredited };
	});

	if (result.outcome === 'not_found') return json({ error: 'Order not found' }, { status: 404 });
	if (result.outcome === 'not_paid') {
		return json(
			{ error: 'This order was never paid — cancel it without a refund.' },
			{ status: 409 }
		);
	}
	if (result.outcome === 'guest') {
		return json(
			{ error: 'Guest order has no account to credit — handle this refund manually.' },
			{ status: 409 }
		);
	}
	if (result.outcome === 'no_amount') {
		return json({ error: 'Order has no amount to refund.' }, { status: 400 });
	}
	if (result.outcome === 'already_refunded') {
		return json({
			success: true,
			alreadyRefunded: true,
			refundedAmount: result.amount,
			orderId: result.order.id
		});
	}

	const { order, amount, alreadyCredited } = result;

	invalidateAdminStatsCache();

	// If this order was a super-affiliate referral's qualifying order, void the
	// ₦700 activation reward when the refund drops them back below the threshold.
	await maybeVoidSuperActivationOnRefund({
		userId: order.userId,
		affiliateUserId: order.affiliateUserId
	}).catch((error) => console.error('super activation void failed:', error));

	// Vesting: void any still-pending affiliate reward for this order (a refund inside the
	// window means it simply never vests), and reverse a regular reward that already
	// vested as a backstop for late refunds.
	await voidUnvestedRewardsForOrder(order.id).catch((error) =>
		console.error('void unvested affiliate reward failed:', error)
	);
	await reverseVestedRegularRewardForOrder(order.id).catch((error) =>
		console.error('reverse vested affiliate reward failed:', error)
	);

	// If the refund drops the buyer below a spend milestone, void the unspent reward.
	await maybeClawbackSpendMilestones(order.userId).catch((error) =>
		console.error('spend-milestone clawback failed:', error)
	);

	await createAdminAuditLog({
		actorUserId: locals.user.id,
		targetUserId: order.userId,
		action: 'order_refunded',
		resourceType: 'order',
		resourceId: order.id,
		description: `Refunded ₦${amount.toLocaleString()} to store credit for order ${order.orderNumber}`,
		metadata: { amount, priorPartialRefunds: alreadyCredited, orderNumber: order.orderNumber }
	}).catch(() => {});

	return json({ success: true, refundedAmount: amount, orderId: order.id });
};
