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

// POST /api/orders/[id]/refund
// Cancel-with-refund: return the paid amount to the buyer as (spend-only) Store
// Credit, mark the order refunded, and log it. Available to any admin with
// orders:manage (includes the assistant). Only refunds money that was received.
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const order = await prisma.order.findUnique({
		where: { id: params.id },
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
	if (!order) return json({ error: 'Order not found' }, { status: 404 });

	if (order.status === 'refunded' || order.paymentStatus === 'refunded') {
		return json({ error: 'This order has already been refunded.' }, { status: 409 });
	}

	const wasPaid =
		order.paymentStatus === 'paid' || order.status === 'paid' || order.status === 'completed';
	if (!wasPaid) {
		return json(
			{ error: 'This order was never paid — cancel it without a refund.' },
			{ status: 409 }
		);
	}

	if (!order.userId) {
		return json(
			{ error: 'Guest order has no account to credit — handle this refund manually.' },
			{ status: 409 }
		);
	}

	const amount = Math.floor(Number(order.totalAmount || 0));
	if (amount <= 0) return json({ error: 'Order has no amount to refund.' }, { status: 400 });

	await prisma.$transaction(async (tx) => {
		await creditStoreCredit(tx, {
			userId: order.userId as string,
			amount,
			type: SC_CREDIT_REFUND,
			description: `Refund for order ${order.orderNumber}`,
			reference: order.id,
			metadata: { orderId: order.id, orderNumber: order.orderNumber, kind: 'order_refund' }
		});
		await tx.order.update({
			where: { id: order.id },
			data: { status: 'refunded', paymentStatus: 'refunded' }
		});
	});

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
		metadata: { amount, orderNumber: order.orderNumber }
	}).catch(() => {});

	return json({ success: true, refundedAmount: amount, orderId: order.id });
};
