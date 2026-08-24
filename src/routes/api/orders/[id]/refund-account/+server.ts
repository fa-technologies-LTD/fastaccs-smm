import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { creditStoreCredit, SC_CREDIT_REFUND } from '$lib/services/store-credit';
import { maybeVoidSuperActivationOnRefund, reconcileAffiliateSales } from '$lib/services/affiliate';
import {
	voidUnvestedRewardsForOrder,
	reverseVestedRegularRewardForOrder,
	reconcileRegularRewardForOrder
} from '$lib/services/affiliate-vesting';
import { maybeClawbackSpendMilestones } from '$lib/services/spend-milestones';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { recordOrderEvent } from '$lib/services/order-events';
import { allocateFullRefundToItems } from '$lib/helpers/order-revenue';

const FAULTY_STATUS = 'faulty';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST /api/orders/[id]/refund-account  { accountId, reason }
// Per-account refund: mark ONE delivered account as faulty (never resold) and refund its
// unit price to the buyer's store credit. If it was the order's last good account, the whole
// order flips to refunded and affiliate rewards are reversed. Idempotent per account.
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const actorUserId = locals.user.id;

	const body = (await request.json().catch(() => ({}))) as { accountId?: string; reason?: string };
	const orderId = String(params.id || '').trim();
	const accountId = String(body.accountId || '').trim();
	const reason = String(body.reason || '')
		.trim()
		.slice(0, 500);
	if (!isUuid(orderId)) return json({ error: 'Invalid order ID' }, { status: 400 });
	if (!isUuid(accountId)) return json({ error: 'A valid accountId is required' }, { status: 400 });

	// Refund + flag the account atomically. Then decide if the whole order is now refunded.
	const result = await prisma.$transaction(
		async (tx) => {
			// This is the same order-level lock used by the full refund endpoint, so a
			// full refund and a per-account refund can never credit overlapping value.
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
			const account = await tx.account.findUnique({
				where: { id: accountId },
				select: {
					id: true,
					status: true,
					username: true,
					deliveryNotes: true,
					orderItem: {
						select: {
							id: true,
							unitPrice: true,
							totalPrice: true,
							quantity: true,
							refundedAmount: true,
							order: {
								select: {
									id: true,
									orderNumber: true,
									userId: true,
									affiliateUserId: true,
									status: true,
									paymentStatus: true,
									deliveryStatus: true,
									subtotal: true,
									totalAmount: true,
									refundedAmount: true,
									orderItems: {
										select: { id: true, totalPrice: true, refundedAmount: true },
										orderBy: { createdAt: 'asc' }
									}
								}
							}
						}
					}
				}
			});

			const orderItem = account?.orderItem;
			const order = orderItem?.order;
			if (!account || !orderItem || !order || order.id !== orderId)
				return { outcome: 'not_found' as const };
			const orderTotal = Math.max(0, Number(order.totalAmount || 0));
			const alreadyRefunded = Math.max(0, Number(order.refundedAmount || 0));
			if (account.status === FAULTY_STATUS) {
				const priorCredit = await tx.walletTransaction.findUnique({
					where: { reference: account.id },
					select: { amount: true }
				});
				return {
					outcome: 'already_refunded' as const,
					account,
					order,
					amount: Math.max(0, Number(priorCredit?.amount || 0))
				};
			}
			if (
				order.status === 'refunded' ||
				order.paymentStatus === 'refunded' ||
				order.deliveryStatus === 'refunded'
			) {
				return { outcome: 'order_refunded' as const };
			}
			if (!order.userId) return { outcome: 'guest' as const };
			const wasPaid =
				order.paymentStatus === 'paid' || order.status === 'paid' || order.status === 'completed';
			if (!wasPaid) return { outcome: 'not_paid' as const };

			// Work out whether this is the final retained account before issuing money. The final
			// item receives the exact remaining order value, eliminating rounding/discount drift.
			const remainingOtherAccounts = await tx.account.count({
				where: {
					id: { not: account.id },
					orderItem: { orderId: order.id },
					status: { in: [...getAllocatedLikeAccountStatuses(), 'delivered'] }
				}
			});
			const orderFullyRefunded = remainingOtherAccounts === 0;
			const subtotal = Math.max(0, Number(order.subtotal || 0));
			const adjustedUnit =
				subtotal > 0
					? (orderTotal * Math.max(0, Number(orderItem.unitPrice || 0))) / subtotal
					: Math.max(0, Number(orderItem.unitPrice || 0));
			const amount = Math.floor(
				Math.min(
					Math.max(0, orderTotal - alreadyRefunded),
					orderFullyRefunded ? Math.max(0, orderTotal - alreadyRefunded) : adjustedUnit
				)
			);
			if (amount <= 0) return { outcome: 'no_amount' as const };

			const noteSuffix = `Refunded as faulty${reason ? `: ${reason}` : ''} (${new Date().toISOString().slice(0, 10)})`;
			await creditStoreCredit(tx, {
				userId: order.userId,
				amount,
				type: SC_CREDIT_REFUND,
				description: `Faulty-account refund for order ${order.orderNumber}`,
				reference: account.id,
				metadata: {
					kind: 'faulty_account_refund',
					orderId: order.id,
					orderNumber: order.orderNumber,
					accountId: account.id,
					reason: reason || null
				}
			});
			await tx.account.update({
				where: { id: account.id },
				data: {
					status: FAULTY_STATUS,
					deliveryNotes: account.deliveryNotes
						? `${account.deliveryNotes}\n${noteSuffix}`
						: noteSuffix
				}
			});
			if (orderFullyRefunded) {
				const itemAllocation = allocateFullRefundToItems(orderTotal, order.orderItems);
				if (Math.abs(itemAllocation.allocatedAmount - orderTotal) > 0.01) {
					throw new Error('ORDER_ITEM_REFUND_ALLOCATION_FAILED');
				}
				for (const item of itemAllocation.targets) {
					await tx.orderItem.update({
						where: { id: item.id },
						data: { refundedAmount: item.refundedAmount }
					});
				}
			} else {
				await tx.orderItem.update({
					where: { id: orderItem.id },
					data: { refundedAmount: { increment: amount } }
				});
			}
			await tx.order.update({
				where: { id: order.id },
				data: orderFullyRefunded
					? {
							status: 'refunded',
							paymentStatus: 'refunded',
							deliveryStatus: 'refunded',
							refundedAmount: orderTotal
						}
					: { refundedAmount: { increment: amount } }
			});
			await recordOrderEvent(
				{
					orderId: order.id,
					orderItemId: orderItem.id,
					accountId: account.id,
					type: orderFullyRefunded ? 'order_refunded' : 'item_refunded',
					source: 'admin',
					actorUserId,
					amount,
					description: reason || 'Faulty account refunded to store credit',
					idempotencyKey: `refund:account:${account.id}`,
					metadata: {
						orderNumber: order.orderNumber,
						reason: reason || null,
						cumulativeRefunded: orderFullyRefunded ? orderTotal : alreadyRefunded + amount
					}
				},
				tx
			);
			return { outcome: 'refunded' as const, account, order, amount, orderFullyRefunded };
		},
		{ maxWait: 10_000, timeout: 20_000 }
	);

	if (result.outcome === 'not_found') {
		return json({ error: 'Account not found on this order' }, { status: 404 });
	}
	if (result.outcome === 'already_refunded') {
		return json({
			success: true,
			alreadyRefunded: true,
			refundedAmount: result.amount,
			accountId: result.account.id,
			orderFullyRefunded:
				result.order.status === 'refunded' ||
				result.order.paymentStatus === 'refunded' ||
				result.order.deliveryStatus === 'refunded'
		});
	}
	if (result.outcome === 'order_refunded') {
		return json(
			{ error: 'The full order has already been refunded; no additional credit was added.' },
			{ status: 409 }
		);
	}
	if (result.outcome === 'guest') {
		return json(
			{ error: 'Guest order has no account to credit — handle this refund manually.' },
			{ status: 409 }
		);
	}
	if (result.outcome === 'not_paid') {
		return json({ error: 'This order was never paid.' }, { status: 409 });
	}
	if (result.outcome === 'no_amount') {
		return json({ error: 'Account has no unit price to refund.' }, { status: 400 });
	}

	const { account, order, amount, orderFullyRefunded } = result;

	invalidateAdminStatsCache();

	// Partial refunds retain a proportionate reward; full refunds unwind it entirely.
	await reconcileAffiliateSales(order.affiliateUserId).catch((e) =>
		console.error('affiliate sales reconciliation failed:', e)
	);
	await maybeClawbackSpendMilestones(order.userId).catch((e) =>
		console.error('spend-milestone clawback failed:', e)
	);
	if (orderFullyRefunded) {
		await maybeVoidSuperActivationOnRefund({
			userId: order.userId,
			affiliateUserId: order.affiliateUserId
		}).catch((e) => console.error('super activation void failed:', e));
		await voidUnvestedRewardsForOrder(order.id).catch((e) =>
			console.error('void unvested affiliate reward failed:', e)
		);
		await reverseVestedRegularRewardForOrder(order.id).catch((e) =>
			console.error('reverse vested affiliate reward failed:', e)
		);
	} else {
		await reconcileRegularRewardForOrder(order.id).catch((e) =>
			console.error('affiliate reward reconciliation failed:', e)
		);
	}

	await createAdminAuditLog({
		actorUserId: locals.user.id,
		targetUserId: order.userId,
		action: 'account_refunded_faulty',
		resourceType: 'order',
		resourceId: order.id,
		description: `Refunded ₦${amount.toLocaleString()} for faulty account @${account.username || account.id} on order ${order.orderNumber}${reason ? ` — ${reason}` : ''}`,
		metadata: {
			amount,
			accountId: account.id,
			orderNumber: order.orderNumber,
			reason,
			orderFullyRefunded
		}
	}).catch(() => {});

	return json({ success: true, refundedAmount: amount, accountId: account.id, orderFullyRefunded });
};
