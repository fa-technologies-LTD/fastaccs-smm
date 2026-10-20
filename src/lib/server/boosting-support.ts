import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { BOOST_SUPPORT_EVENT_TYPES, getBoostSupportState } from '$lib/helpers/boosting-support';
import {
	validateLinkForAction,
	type BoostingActionType,
	type BoostingPlatform
} from '$lib/helpers/social-link-validator';
import { getBoostingServiceConfig } from '$lib/helpers/boosting-service-config';

export class BoostSupportError extends Error {
	constructor(
		message: string,
		public status = 409
	) {
		super(message);
	}
}

export const supportEventSelect = {
	id: true,
	type: true,
	description: true,
	metadata: true,
	occurredAt: true
} as const;
export async function readBoostSupport(tx: Prisma.TransactionClient, itemId: string) {
	return getBoostSupportState(
		await tx.orderEvent.findMany({
			where: { orderItemId: itemId, type: { in: [...BOOST_SUPPORT_EVENT_TYPES] } },
			select: supportEventSelect,
			orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
			take: 100
		})
	);
}

/** Support/accounting only. No supplier API, queue, email or money mutation is imported here. */
export async function applyBoostSupportAction(
	tx: Prisma.TransactionClient,
	input: {
		itemId: string;
		actorId: string;
		operationId: string;
		expectedRevision: string | null;
		action: 'request_link' | 'message' | 'confirm_delivery' | 'reply';
		message: string;
		confirmed?: boolean;
		evidence?: string;
		orderId?: string;
		requestId?: string;
		link?: string;
	}
) {
	input = { ...input };
	const preflight = await tx.orderItem.findUnique({
		where: { id: input.itemId },
		select: { orderId: true }
	});
	if (!preflight) throw new BoostSupportError('Order item not found.', 404);
	await tx.$queryRaw`SELECT id FROM orders WHERE id=${preflight.orderId}::uuid FOR UPDATE`;
	await tx.$queryRaw`SELECT id FROM boost_fulfillments WHERE order_item_id=${input.itemId}::uuid FOR UPDATE`;
	const item = await tx.orderItem.findUnique({
		where: { id: input.itemId },
		include: { order: true, boostFulfillment: true, category: { select: { metadata: true } } }
	});
	if (!item?.boostTargetUrl) throw new BoostSupportError('Boosting order item not found.', 404);
	if (item.orderId !== preflight.orderId)
		throw new BoostSupportError('This order changed. Refresh before continuing.');
	if (
		input.action === 'reply' &&
		(item.orderId !== input.orderId || item.order.userId !== input.actorId)
	)
		throw new BoostSupportError('Order item not found.', 404);
	const key = `boost-support:${input.actorId}:${input.operationId}`;
	const inputHash = createHash('sha256')
		.update(
			JSON.stringify([
				input.itemId,
				input.action,
				input.message,
				input.evidence ?? null,
				input.confirmed === true,
				input.requestId ?? null,
				input.link ?? null
			])
		)
		.digest('hex');
	const previous = await tx.orderEvent.findUnique({ where: { idempotencyKey: key } });
	if (previous) {
		if (
			previous.orderItemId !== item.id ||
			(previous.metadata as Record<string, unknown>)?.inputHash !== inputHash
		)
			throw new BoostSupportError(
				'This action key was already used with different details. Refresh before continuing.'
			);
		return { support: await readBoostSupport(tx, item.id), repeated: true };
	}
	if (!isOrderPaymentConfirmed(item.order) || item.order.deliveryStatus === 'refunded')
		throw new BoostSupportError(
			'This order is no longer eligible. Check its payment or refund status.'
		);
	if (['request_link', 'message'].includes(input.action) && !item.order.userId)
		throw new BoostSupportError(
			'This order has no signed-in customer. Contact them using the existing order details instead.'
		);
	const support = await readBoostSupport(tx, item.id);
	if (support.revision !== input.expectedRevision)
		throw new BoostSupportError('This review changed. Refresh before sending another update.');
	const fulfillment = item.boostFulfillment;
	const now = new Date(
		Math.max(Date.now(), support.updatedAt ? Date.parse(support.updatedAt) + 1 : 0)
	);
	const busy =
		fulfillment &&
		(['queued', 'submitted', 'in_progress', 'submission_unknown'].includes(fulfillment.status) ||
			Boolean(
				fulfillment.leaseToken && fulfillment.leaseExpiresAt && fulfillment.leaseExpiresAt > now
			));
	if (input.action !== 'message' && busy)
		throw new BoostSupportError(
			'A supplier submission is active or uncertain. Send a customer update instead; do not replace its link or close delivery yet.'
		);
	if (
		['request_link', 'confirm_delivery'].includes(input.action) &&
		fulfillment?.supplierOrderId &&
		!/^(completed|complete|cancelled|canceled|failed|refunded|partial)$/i.test(
			fulfillment.rawProviderStatus?.trim() ?? ''
		)
	)
		throw new BoostSupportError(
			'The recorded supplier result is not final. Review it before requesting a different link or closing delivery.'
		);
	if (input.action === 'confirm_delivery') {
		if (
			!input.confirmed ||
			!input.evidence ||
			input.evidence.trim().length < 10 ||
			input.evidence.length > 1000
		)
			throw new BoostSupportError(
				'Confirm actual delivery and record what you checked (10–1,000 characters).',
				400
			);
		if (Number(item.refundedAmount) > 0)
			throw new BoostSupportError(
				'This item has a refund recorded. Review its accounting before resolving.'
			);
		if (fulfillment && !['manual_review', 'completed'].includes(fulfillment.status))
			throw new BoostSupportError('Only a held delivery review can be resolved here.');
		const activeCase = fulfillment
			? await tx.boostComplaint.findFirst({
					where: {
						fulfillmentId: fulfillment.id,
						status: { in: ['escalating', 'escalated', 'escalation_unknown'] }
					},
					select: { id: true }
				})
			: null;
		if (activeCase)
			throw new BoostSupportError(
				'A supplier support case is still open. Resolve that case before confirming delivery.'
			);
		if (fulfillment?.status === 'completed') {
			const openReview = await tx.boostComplaint.findFirst({
				where: { fulfillmentId: fulfillment.id, status: { in: ['open', 'validated'] } },
				select: { id: true }
			});
			if (!openReview)
				throw new BoostSupportError('This delivery is already completed and has no open review.');
		}
		const unknown = fulfillment
			? await tx.boostAttempt.findFirst({
					where: {
						fulfillmentId: fulfillment.id,
						type: 'submission',
						outcome: { in: ['started', 'submission_unknown'] }
					},
					select: { id: true }
				})
			: null;
		if (unknown && !fulfillment?.supplierOrderId)
			throw new BoostSupportError(
				'Supplier submission is uncertain. Check the supplier reference before resolving.'
			);
		await tx.orderItem.update({
			where: { id: item.id },
			data: { boostFulfillmentStatus: 'completed', boostCompletedAt: now }
		});
		await tx.boostFulfillment.updateMany({
			where: { orderItemId: item.id },
			data: {
				status: 'completed',
				customerStatus: 'completed',
				completedAt: now,
				nextActionAt: null,
				lastSafeErrorCategory: null
			}
		});
		if (fulfillment)
			await tx.boostComplaint.updateMany({
				where: { fulfillmentId: fulfillment.id, status: { in: ['open', 'validated'] } },
				data: {
					status: 'resolved',
					resolvedAt: now,
					validationNote: input.message,
					validatedByUserId: input.actorId
				}
			});
		const siblings = await tx.orderItem.findMany({
			where: { orderId: item.orderId },
			select: { boostTargetUrl: true, boostFulfillmentStatus: true }
		});
		const allCompleted =
			siblings.length > 0 &&
			siblings.every(
				(sibling) => sibling.boostTargetUrl && sibling.boostFulfillmentStatus === 'completed'
			);
		await tx.order.update({
			where: { id: item.orderId },
			data: allCompleted
				? { status: 'completed', deliveryStatus: 'delivered', deliveredAt: now }
				: { status: 'paid', deliveryStatus: 'processing', deliveredAt: null }
		});
	} else if (input.action === 'request_link') {
		if (fulfillment?.status === 'completed' || item.boostFulfillmentStatus === 'completed')
			throw new BoostSupportError(
				'This item is completed. Use a customer update or review its complaint instead.'
			);
		await tx.orderItem.update({
			where: { id: item.id },
			data: { boostFulfillmentStatus: 'needs_link' }
		});
		await tx.boostFulfillment.updateMany({
			where: { orderItemId: item.id },
			data: {
				status: 'manual_review',
				customerStatus: 'processing',
				nextActionAt: null,
				lastSafeErrorCategory: 'admin_link_requested'
			}
		});
		await tx.order.update({
			where: { id: item.orderId },
			data: { status: 'paid', deliveryStatus: 'processing', deliveredAt: null }
		});
	} else if (input.action === 'reply') {
		if (fulfillment && fulfillment.status !== 'manual_review')
			throw new BoostSupportError('This delivery has changed. Refresh your order before replying.');
		if (support.state !== 'awaiting_customer' || support.requestId !== input.requestId)
			throw new BoostSupportError(
				'This link request has changed or is already answered. Refresh your order.'
			);
		const snapshot = fulfillment?.offerSnapshot as Record<string, unknown> | null;
		const legacy = getBoostingServiceConfig(item.category.metadata);
		const validation = validateLinkForAction(
			String(snapshot?.platform || fulfillment?.platform || legacy.platform) as BoostingPlatform,
			String(snapshot?.outcome || fulfillment?.outcome || legacy.actionType) as BoostingActionType,
			input.link ?? ''
		);
		if (
			!validation.valid ||
			!validation.normalizedUrl ||
			!validation.normalizedUrl.startsWith('https://')
		)
			throw new BoostSupportError(
				validation.reason || 'Please send a valid public HTTPS link.',
				400
			);
		input.link = validation.normalizedUrl;
		await tx.orderItem.update({
			where: { id: item.id },
			data: { boostFulfillmentStatus: 'under_review' }
		});
		await tx.boostFulfillment.updateMany({
			where: { orderItemId: item.id },
			data: { lastSafeErrorCategory: 'admin_link_reply', nextActionAt: null }
		});
		const managers = await tx.adminRoleAssignment.findMany({
			where: { role: { in: ['FULL_ADMIN', 'ORDER_MANAGER'] }, user: { isActive: true } },
			select: { userId: true }
		});
		if (managers.length)
			await tx.notification.createMany({
				data: managers.map((manager) => ({
					userId: manager.userId,
					orderId: item.orderId,
					type: 'admin_order_review',
					title: 'Customer sent a link for review',
					message: `${item.order.orderNumber}: a customer reply is waiting. The original supplier target has not changed.`
				}))
			});
	}
	const eventId = randomUUID();
	await tx.orderEvent.create({
		data: {
			id: eventId,
			orderId: item.orderId,
			orderItemId: item.id,
			actorUserId: input.actorId,
			type:
				input.action === 'reply'
					? 'boosting_support_replied'
					: input.action === 'confirm_delivery'
						? 'boosting_support_resolved'
						: input.action === 'message'
							? 'customer_support_update'
							: 'boosting_support_requested',
			source: input.action === 'reply' ? 'customer.order' : 'admin.boosting_support',
			description: input.message,
			idempotencyKey: key,
			occurredAt: now,
			metadata: {
				action: input.action,
				inputHash,
				requestId: input.requestId ?? null,
				...(input.action === 'reply' ? { link: input.link } : {}),
				...(input.action === 'confirm_delivery'
					? {
							manuallyConfirmed: true,
							evidence: input.evidence,
							previousStatus: item.boostFulfillmentStatus,
							previousHoldReason: fulfillment?.lastSafeErrorCategory ?? null,
							previousSupplierStatus: fulfillment?.rawProviderStatus ?? null
						}
					: {})
			}
		}
	});
	if (input.action !== 'reply' && item.order.userId)
		await tx.notification.create({
			data: {
				userId: item.order.userId,
				orderId: item.orderId,
				type: input.action === 'request_link' ? 'boosting_link_review' : 'boosting_issue',
				title:
					input.action === 'request_link'
						? 'A link is needed for your order'
						: input.action === 'confirm_delivery'
							? 'Your order review is resolved'
							: 'An update about your order',
				message: input.message
			}
		});
	return { support: await readBoostSupport(tx, item.id), repeated: false };
}
