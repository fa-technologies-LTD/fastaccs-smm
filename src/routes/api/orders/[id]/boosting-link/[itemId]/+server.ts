import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';
import { validateLinkForAction } from '$lib/helpers/social-link-validator';
import { recordOrderEvent } from '$lib/services/order-events';

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
	if (!['paid', 'success', 'overpaid'].includes(String(item.order.paymentStatus || '').toLowerCase())) {
		return json({ success: false, error: 'This order is not ready for a link update.' }, { status: 409 });
	}
	if (!['pending', 'needs_link'].includes(item.boostFulfillmentStatus || 'pending')) {
		return json(
			{ success: false, error: 'This boost has already started. Contact support before changing it.' },
			{ status: 409 }
		);
	}

	const body = (await request.json().catch(() => ({}))) as { targetUrl?: unknown };
	const targetUrl = String(body.targetUrl || '').trim();
	const config = getBoostingServiceConfig(item.category.metadata);
	const validation = validateLinkForAction(config.platform, config.actionType, targetUrl);
	if (!validation.valid || !validation.normalizedUrl) {
		return json(
			{ success: false, error: validation.reason || `Please enter a valid link for ${item.category.name}.` },
			{ status: 400 }
		);
	}

	const normalizedUrl = validation.normalizedUrl;
	await prisma.$transaction(async (tx) => {
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

	return json({
		success: true,
		data: { targetUrl: normalizedUrl, boostFulfillmentStatus: 'pending' },
		error: null
	});
};
