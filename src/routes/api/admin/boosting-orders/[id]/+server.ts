import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { recordOrderEvent } from '$lib/services/order-events';

const VALID_STATUSES = ['pending', 'in_progress', 'needs_link', 'completed', 'rejected'] as const;
const CONFIRMED_PAYMENT_STATUSES = new Set(['paid', 'success', 'overpaid']);
type BoostFulfillmentStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is BoostFulfillmentStatus {
	return typeof value === 'string' && VALID_STATUSES.includes(value as BoostFulfillmentStatus);
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (
		!locals.user ||
		!locals.adminContext ||
		!hasAdminPermission(locals.adminContext, 'admin:orders:manage')
	) {
		return json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
	}

	const orderItemId = String(params.id || '').trim();
	if (!orderItemId) {
		return json({ success: false, data: null, error: 'Missing order item id' }, { status: 400 });
	}

	const existing = await prisma.orderItem.findUnique({
		where: { id: orderItemId },
		select: {
			id: true,
			orderId: true,
			boostTargetUrl: true,
			boostFulfillmentStatus: true,
			boostProviderReference: true,
			order: { select: { userId: true, orderNumber: true, paymentStatus: true } }
		}
	});
	if (!existing || !existing.boostTargetUrl) {
		return json(
			{ success: false, data: null, error: 'Boosting order item not found' },
			{ status: 404 }
		);
	}
	if (!CONFIRMED_PAYMENT_STATUSES.has(String(existing.order.paymentStatus || '').toLowerCase())) {
		return json(
			{ success: false, data: null, error: 'Only paid boosting orders can be updated.' },
			{ status: 409 }
		);
	}

	const body = (await request.json().catch(() => ({}))) as {
		status?: unknown;
		providerReference?: unknown;
		reason?: unknown;
	};
	const reason = String(body.reason || '')
		.trim()
		.slice(0, 500);

	const data: {
		boostFulfillmentStatus?: BoostFulfillmentStatus;
		boostProviderReference?: string | null;
		boostCompletedAt?: Date | null;
	} = {};

	if (body.status !== undefined) {
		if (!isValidStatus(body.status)) {
			return json({ success: false, data: null, error: 'Invalid status' }, { status: 400 });
		}
		if (['needs_link', 'rejected'].includes(body.status) && reason.length < 3) {
			return json(
				{ success: false, data: null, error: 'Please give the customer a clear reason.' },
				{ status: 400 }
			);
		}
		data.boostFulfillmentStatus = body.status;
		data.boostCompletedAt = body.status === 'completed' ? new Date() : null;
	}

	if (body.providerReference !== undefined) {
		const trimmed = String(body.providerReference || '').trim();
		data.boostProviderReference = trimmed ? trimmed.slice(0, 200) : null;
	}

	if (Object.keys(data).length === 0) {
		return json({ success: false, data: null, error: 'No changes provided' }, { status: 400 });
	}

	const updated = await prisma.$transaction(async (tx) => {
		const item = await tx.orderItem.update({ where: { id: orderItemId }, data });

		if (data.boostFulfillmentStatus !== undefined) {
			const siblingItems = await tx.orderItem.findMany({
				where: { orderId: existing.orderId, boostTargetUrl: { not: null } },
				select: { boostFulfillmentStatus: true }
			});
			const allCompleted = siblingItems.every(
				(sibling) => sibling.boostFulfillmentStatus === 'completed'
			);
			const allRejected = siblingItems.every(
				(sibling) => sibling.boostFulfillmentStatus === 'rejected'
			);

			await tx.order.update({
				where: { id: existing.orderId },
				data: allCompleted
					? { status: 'completed', deliveryStatus: 'delivered', deliveredAt: new Date() }
					: allRejected
						? { status: 'paid', deliveryStatus: 'failed', deliveredAt: null }
						: { status: 'paid', deliveryStatus: 'processing', deliveredAt: null }
			});

			const eventType =
				data.boostFulfillmentStatus === 'needs_link'
					? 'boosting_link_review_requested'
					: data.boostFulfillmentStatus === 'rejected'
						? 'boosting_rejected'
						: 'boosting_status_changed';
			await recordOrderEvent(
				{
					orderId: existing.orderId,
					orderItemId,
					type: eventType,
					source: 'admin.boosting_orders',
					actorUserId: locals.user!.id,
					description: reason || null,
					metadata: {
						fromStatus: existing.boostFulfillmentStatus || 'pending',
						toStatus: data.boostFulfillmentStatus
					}
				},
				tx
			);

			if (
				existing.order.userId &&
				['needs_link', 'rejected'].includes(data.boostFulfillmentStatus)
			) {
				const needsLink = data.boostFulfillmentStatus === 'needs_link';
				await tx.notification.create({
					data: {
						userId: existing.order.userId,
						type: needsLink ? 'boosting_link_review' : 'boosting_issue',
						title: needsLink ? 'Update your boosting link' : 'Boosting order needs attention',
						message: needsLink
							? reason
							: `We couldn't process this boost. Support is reviewing your paid order. ${reason}`,
						orderId: existing.orderId
					}
				});
			}
		}

		if (data.boostProviderReference !== undefined) {
			await recordOrderEvent(
				{
					orderId: existing.orderId,
					orderItemId,
					type: 'boosting_provider_reference_changed',
					source: 'admin.boosting_orders',
					actorUserId: locals.user!.id,
					description: data.boostProviderReference
						? 'Supplier reference saved'
						: 'Supplier reference removed',
					metadata: {
						previousReference: existing.boostProviderReference,
						providerReference: data.boostProviderReference
					}
				},
				tx
			);
		}

		return item;
	});

	return json({
		success: true,
		data: {
			...updated,
			latestIssue:
				data.boostFulfillmentStatus === 'needs_link' || data.boostFulfillmentStatus === 'rejected'
					? { reason, occurredAt: new Date().toISOString() }
					: null
		},
		error: null
	});
};
