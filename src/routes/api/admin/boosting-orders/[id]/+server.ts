import { json } from '@sveltejs/kit';
import type { OrderItem } from '@prisma/client';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { recordOrderEvent } from '$lib/services/order-events';
import { notifyBoostingOrderCompleted } from '$lib/services/boosting-fulfillment-notifications';
import { queuePaidBoostFulfillments } from '$lib/server/boosting-providers/fulfillment-worker';
import { supplierSubmissionMayExist } from '$lib/server/boosting-providers/transition-safety';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';

const VALID_STATUSES = ['pending', 'in_progress', 'needs_link', 'completed', 'rejected'] as const;
type BoostFulfillmentStatus = (typeof VALID_STATUSES)[number];

class UnsafeBoostTransitionError extends Error {}
class ChangedBoostOrderError extends Error {}
class AutomationOwnedBoostError extends Error {}

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
			order: {
				select: {
					userId: true,
					orderNumber: true,
					paymentStatus: true,
					status: true,
					deliveryStatus: true
				}
			}
		}
	});
	if (!existing || !existing.boostTargetUrl) {
		return json(
			{ success: false, data: null, error: 'Boosting order item not found' },
			{ status: 404 }
		);
	}
	if (!isOrderPaymentConfirmed(existing.order) || existing.order.deliveryStatus === 'refunded') {
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

	let updated: OrderItem;
	try {
		updated = await prisma.$transaction(async (tx) => {
			// Same lock order as refunds and supplier-result commits. Preflight may be stale.
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${existing.orderId}::uuid FOR UPDATE`;
			const current = await tx.orderItem.findUnique({
				where: { id: orderItemId },
				select: {
					boostFulfillmentStatus: true,
					order: { select: { status: true, paymentStatus: true, deliveryStatus: true } }
				}
			});
			if (
				!current ||
				!isOrderPaymentConfirmed(current.order) ||
				current.order.deliveryStatus === 'refunded' ||
				current.boostFulfillmentStatus !== existing.boostFulfillmentStatus
			)
				throw new ChangedBoostOrderError();
			if (data.boostFulfillmentStatus !== undefined) {
				await tx.$queryRaw`SELECT id FROM boost_fulfillments WHERE order_item_id = ${orderItemId}::uuid FOR UPDATE`;
				const fulfillment = await tx.boostFulfillment.findUnique({
					where: { orderItemId },
					select: {
						status: true,
						fulfillmentMode: true,
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
				if (
					fulfillment &&
					(!['manual', 'shadow'].includes(fulfillment.fulfillmentMode) ||
						Boolean(
							fulfillment.leaseToken &&
								fulfillment.leaseExpiresAt &&
								fulfillment.leaseExpiresAt > new Date()
						) ||
						['submitted', 'in_progress'].includes(fulfillment.status))
				)
					throw new AutomationOwnedBoostError();
				if (
					['pending', 'needs_link'].includes(data.boostFulfillmentStatus) &&
					supplierSubmissionMayExist(fulfillment)
				)
					throw new UnsafeBoostTransitionError();
				if (
					data.boostFulfillmentStatus === 'completed' &&
					fulfillment?.attempts.some((attempt) =>
						['started', 'submission_unknown'].includes(attempt.outcome)
					)
				)
					throw new UnsafeBoostTransitionError();
			}
			const item = await tx.orderItem.update({ where: { id: orderItemId }, data });

			if (data.boostFulfillmentStatus !== undefined) {
				const now = new Date();
				const fulfillmentData =
					data.boostFulfillmentStatus === 'completed'
						? {
								status: 'completed',
								customerStatus: 'completed',
								completedAt: now,
								nextActionAt: null,
								lastSafeErrorCategory: null
							}
						: data.boostFulfillmentStatus === 'pending'
							? {
									status: 'awaiting_payment',
									customerStatus: 'processing',
									nextActionAt: null,
									lastSafeErrorCategory: null,
									completedAt: null
								}
							: {
									status: 'manual_review',
									customerStatus:
										data.boostFulfillmentStatus === 'in_progress' ? 'in_progress' : 'processing',
									nextActionAt: null,
									lastSafeErrorCategory: `admin_${data.boostFulfillmentStatus}`,
									completedAt: null
								};
				await tx.boostFulfillment.updateMany({
					where: { orderItemId },
					data: fulfillmentData
				});
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
	} catch (error) {
		if (error instanceof ChangedBoostOrderError || error instanceof AutomationOwnedBoostError) {
			return json(
				{
					success: false,
					data: null,
					error:
						error instanceof ChangedBoostOrderError
							? 'This order changed or is no longer paid. Refresh before making changes.'
							: 'Automation manages this delivery. Review the supplier result or refund from the order page; do not override its status here.'
				},
				{ status: 409 }
			);
		}
		if (error instanceof UnsafeBoostTransitionError) {
			return json(
				{
					success: false,
					data: null,
					error:
						'This supplier order may already have started. Keep it in manual review to avoid a duplicate charge.'
				},
				{ status: 409 }
			);
		}
		throw error;
	}
	if (data.boostFulfillmentStatus === 'pending') {
		await queuePaidBoostFulfillments(existing.orderId);
	}
	if (data.boostFulfillmentStatus === 'completed') {
		await notifyBoostingOrderCompleted(existing.orderId);
	}

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
