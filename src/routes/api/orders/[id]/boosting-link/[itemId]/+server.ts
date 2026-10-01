import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
import { validateLinkForAction } from '$lib/helpers/social-link-validator';
import { recordOrderEvent } from '$lib/services/order-events';
import { queuePaidBoostFulfillments } from '$lib/server/boosting-providers/fulfillment-worker';
import { supplierSubmissionMayExist } from '$lib/server/boosting-providers/transition-safety';

class UnsafeBoostLinkChangeError extends Error {}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Please log in again.' }, { status: 401 });
	}

	const orderId = String(params.id || '').trim();
	const orderItemId = String(params.itemId || '').trim();
	if (!orderId || !orderItemId) {
		return json({ success: false, error: 'Boosting order item not found.' }, { status: 404 });
	}

	const item = await prisma.orderItem.findFirst({
		where: { id: orderItemId, orderId, boostTargetUrl: { not: null } },
		select: {
			id: true,
			boostTargetUrl: true,
			boostFulfillmentStatus: true,
			category: { select: { name: true, metadata: true } },
			order: { select: { userId: true, paymentStatus: true } }
		}
	});
	if (!item) {
		return json({ success: false, error: 'Boosting order item not found.' }, { status: 404 });
	}

	const isOwner = item.order.userId === locals.user.id;
	const isAdmin = hasAdminPermission(locals.adminContext, 'admin:orders:manage');
	if (!isOwner && !isAdmin) {
		return json({ success: false, error: 'Unauthorized.' }, { status: 403 });
	}
	if (
		!['paid', 'success', 'overpaid'].includes(String(item.order.paymentStatus || '').toLowerCase())
	) {
		return json(
			{ success: false, error: 'This order is not ready for a link update.' },
			{ status: 409 }
		);
	}
	if (!['pending', 'needs_link'].includes(item.boostFulfillmentStatus || 'pending')) {
		return json(
			{
				success: false,
				error: 'This boost has already started. Contact support before changing it.'
			},
			{ status: 409 }
		);
	}

	const body = (await request.json().catch(() => ({}))) as { targetUrl?: unknown };
	const targetUrl = String(body.targetUrl || '').trim();
	const config = getBoostingServiceConfig(item.category.metadata);
	const validation = validateLinkForAction(config.platform, config.actionType, targetUrl);
	if (!validation.valid || !validation.normalizedUrl) {
		return json(
			{
				success: false,
				error: validation.reason || `Please enter a valid link for ${item.category.name}.`
			},
			{ status: 400 }
		);
	}

	const normalizedUrl = validation.normalizedUrl;
	const targetKey = `${config.platform}:${createHash('sha256')
		.update(`${config.platform}:${config.actionType}:${normalizedUrl}`)
		.digest('hex')}`;
	try {
		await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM boost_fulfillments WHERE order_item_id = ${orderItemId}::uuid FOR UPDATE`;
			const fulfillment = await tx.boostFulfillment.findUnique({
				where: { orderItemId },
				select: {
					status: true,
					supplierOrderId: true,
					submittedAt: true,
					leaseToken: true,
					leaseExpiresAt: true,
					attempts: {
						where: { type: 'submission' },
						select: { type: true, outcome: true },
						orderBy: { createdAt: 'desc' },
						take: 1
					}
				}
			});
			if (supplierSubmissionMayExist(fulfillment)) throw new UnsafeBoostLinkChangeError();
			await tx.orderItem.update({
				where: { id: orderItemId },
				data: {
					boostTargetUrl: normalizedUrl,
					boostFulfillmentStatus: 'pending',
					boostCompletedAt: null
				}
			});
			await tx.order.update({
				where: { id: orderId },
				data: { status: 'paid', deliveryStatus: 'processing', deliveredAt: null }
			});
			await tx.boostFulfillment.updateMany({
				where: {
					orderItemId,
					status: { in: ['awaiting_payment', 'queued', 'manual_review'] }
				},
				data: {
					targetUrl: normalizedUrl,
					targetKey,
					status: 'awaiting_payment',
					customerStatus: 'processing',
					selectedRouteId: null,
					lastSafeErrorCategory: null,
					nextActionAt: null
				}
			});
			await recordOrderEvent(
				{
					orderId,
					orderItemId,
					type: 'boosting_link_updated',
					source: isAdmin ? 'admin.order' : 'customer.order',
					actorUserId: locals.user!.id,
					description: 'Boosting target link updated',
					metadata: {
						previousUrl: item.boostTargetUrl,
						needsManualReview: Boolean(validation.needsManualReview)
					}
				},
				tx
			);
		});
	} catch (error) {
		if (error instanceof UnsafeBoostLinkChangeError) {
			return json(
				{
					success: false,
					error:
						'This boost may already have reached the supplier. Contact support before changing its link.'
				},
				{ status: 409 }
			);
		}
		throw error;
	}
	await queuePaidBoostFulfillments(orderId);

	return json({
		success: true,
		data: { targetUrl: normalizedUrl, boostFulfillmentStatus: 'pending' },
		error: null
	});
};
