import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { recordOrderEvent } from '$lib/services/order-events';

/** The old account after a replacement: never resold, never counted as sold or in stock. */
const REPLACED_STATUS = 'replaced';

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST /api/orders/[id]/replace-account  { accountId, reason }
// Admin-only outcome for a faulty account: give the buyer a fresh account of the same type from
// stock, and retire the old one as "replaced". No money moves. The buyer sees the new login on
// their order straight away. Fails cleanly when that account type has nothing in stock.
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

	const handedOver = new Set([...getAllocatedLikeAccountStatuses(), 'delivered']);

	const result = await prisma.$transaction(
		async (tx) => {
			// Same order lock as the refund endpoints: a replacement and a refund never overlap.
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
			const account = await tx.account.findUnique({
				where: { id: accountId },
				select: {
					id: true,
					status: true,
					categoryId: true,
					orderItem: {
						select: {
							id: true,
							order: {
								select: {
									id: true,
									orderNumber: true,
									status: true,
									paymentStatus: true,
									deliveryStatus: true
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
			if (
				[order.status, order.paymentStatus, order.deliveryStatus].includes('refunded') ||
				!isOrderPaymentConfirmed(order)
			)
				return { outcome: 'closed' as const };
			if (!handedOver.has(String(account.status).toLowerCase()))
				return { outcome: 'not_replaceable' as const, status: account.status };

			const keepStatus =
				String(account.status).toLowerCase() === 'delivered' ? 'delivered' : 'allocated';
			const fresh = await tx.$queryRaw<Array<{ id: string }>>`
				WITH candidate AS (
					SELECT id
					FROM accounts
					WHERE category_id = ${account.categoryId}::uuid
						AND status = 'available'
					ORDER BY created_at ASC
					LIMIT 1
					FOR UPDATE SKIP LOCKED
				)
				UPDATE accounts AS a
				SET
					status = ${keepStatus},
					order_item_id = ${orderItem.id}::uuid,
					delivered_at = CASE WHEN ${keepStatus} = 'delivered' THEN NOW() ELSE a.delivered_at END,
					updated_at = NOW()
				FROM candidate
				WHERE a.id = candidate.id
				RETURNING a.id;
			`;
			if (fresh.length === 0) return { outcome: 'no_stock' as const };

			await tx.account.update({
				where: { id: account.id },
				data: { status: REPLACED_STATUS }
			});
			await recordOrderEvent(
				{
					orderId: order.id,
					orderItemId: orderItem.id,
					accountId: account.id,
					type: 'account_replaced',
					source: 'admin',
					actorUserId,
					description: reason || 'Faulty account replaced with a new one',
					idempotencyKey: `replace:account:${account.id}`,
					metadata: {
						orderNumber: order.orderNumber,
						replacementAccountId: fresh[0].id,
						reason: reason || null
					}
				},
				tx
			);
			return { outcome: 'replaced' as const, newAccountId: fresh[0].id };
		},
		{ maxWait: 10_000, timeout: 20_000 }
	);

	if (result.outcome === 'not_found')
		return json({ error: 'Account not found on this order' }, { status: 404 });
	if (result.outcome === 'closed')
		return json(
			{ error: 'This order is closed, so its accounts can’t be replaced.' },
			{ status: 409 }
		);
	if (result.outcome === 'not_replaceable')
		return json(
			{ error: `This account is already ${result.status}, so it can’t be replaced again.` },
			{ status: 409 }
		);
	if (result.outcome === 'no_stock')
		return json(
			{ error: 'No accounts of this type are in stock. Upload logs, or refund instead.' },
			{ status: 409 }
		);

	invalidateAdminStatsCache();
	return json({ success: true, newAccountId: result.newAccountId });
};
