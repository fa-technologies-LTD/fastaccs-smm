import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import {
	getBoostComplaintEligibility,
	isBoostComplaintType
} from '$lib/server/boosting-providers/complaints';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { recordOrderEvent } from '$lib/services/order-events';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ success: false, error: 'Sign in first.' }, { status: 401 });
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const itemId = String(body.itemId || '').trim();
	const type = body.type;
	const customerNote =
		String(body.note || '')
			.trim()
			.slice(0, 500) || null;
	if (!itemId || !isBoostComplaintType(type)) {
		return json({ success: false, error: 'Choose a valid issue.' }, { status: 400 });
	}
	const fulfillment = await prisma.boostFulfillment.findFirst({
		where: {
			orderItemId: itemId,
			orderItem: { orderId: params.id, order: { userId: locals.user.id } }
		},
		include: {
			orderItem: {
				select: {
					id: true,
					orderId: true,
					order: { select: { orderNumber: true, status: true, paymentStatus: true } }
				}
			},
			complaints: {
				where: {
					status: { in: ['open', 'validated', 'escalating', 'escalation_unknown', 'escalated'] }
				}
			}
		}
	});
	if (!fulfillment) {
		return json(
			{ success: false, error: 'This Boosting item is not available for issue reporting.' },
			{ status: 404 }
		);
	}
	const eligibility = getBoostComplaintEligibility({
		offerSnapshot: fulfillment.offerSnapshot,
		completedAt: fulfillment.completedAt,
		submittedAt: fulfillment.submittedAt,
		fulfillmentStatus: fulfillment.status,
		paymentConfirmed: isOrderPaymentConfirmed(fulfillment.orderItem.order)
	});
	if (!eligibility.allowedTypes.includes(type)) {
		return json(
			{ success: false, error: 'This issue is outside the protection included with your choice.' },
			{ status: 400 }
		);
	}
	if (fulfillment.complaints.some((complaint) => complaint.type === type)) {
		return json(
			{ success: false, error: 'This issue has already been reported and is being reviewed.' },
			{ status: 409 }
		);
	}
	try {
		const complaint = await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${fulfillment.orderItem.orderId}::uuid FOR UPDATE`;
			const current = await tx.boostFulfillment.findUnique({
				where: { id: fulfillment.id },
				include: { orderItem: { include: { order: true } } }
			});
			if (!current || current.orderItem.order.userId !== locals.user!.id) return null;
			const currentEligibility = getBoostComplaintEligibility({
				offerSnapshot: current.offerSnapshot,
				completedAt: current.completedAt,
				submittedAt: current.submittedAt,
				fulfillmentStatus: current.status,
				paymentConfirmed: isOrderPaymentConfirmed(current.orderItem.order)
			});
			if (!currentEligibility.allowedTypes.includes(type)) return null;
			return tx.boostComplaint.create({
				data: {
					fulfillmentId: fulfillment.id,
					userId: locals.user!.id,
					type,
					customerNote,
					eligibilitySnapshot: {
						allowedTypes: currentEligibility.allowedTypes,
						refillEndsAt: currentEligibility.refillEndsAt,
						originalTargetUrl: current.targetUrl,
						note: currentEligibility.note
					}
				}
			});
		});
		if (!complaint)
			return json(
				{ success: false, error: 'This request is no longer eligible. Refresh your order.' },
				{ status: 409 }
			);
		await recordOrderEvent({
			orderId: fulfillment.orderItem.orderId,
			orderItemId: fulfillment.orderItem.id,
			type: 'boosting_complaint_submitted',
			source: 'customer.order',
			actorUserId: locals.user.id,
			description: type,
			idempotencyKey: `boosting:complaint:${complaint.id}:submitted`,
			metadata: { complaintId: complaint.id, complaintType: type }
		}).catch((error) => {
			console.error('[boosting.complaint] event failed:', (error as Error).message);
		});
		await sendCriticalAdminAlert({
			title: 'Boosting customer report',
			message: `Order: ${fulfillment.orderItem.order.orderNumber}\nIssue: ${String(type).replaceAll('_', ' ')}\n\nReview the target and respond from the Boosting exception queue.`,
			source: 'customer.boosting_complaint',
			preheader: `${fulfillment.orderItem.order.orderNumber} · ${String(type).replaceAll('_', ' ')}`,
			ctaText: 'Review report',
			ctaUrl: 'https://smm.fastaccs.com/admin/boosting-orders',
			dedupeKey: `boosting-complaint:${complaint.id}`,
			cooldownMs: 3650 * 24 * 60 * 60 * 1000
		}).catch((error) => {
			console.error('[boosting.complaint] admin alert failed:', (error as Error).message);
		});
		return json({ success: true, data: { id: complaint.id, status: complaint.status } });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
			return json(
				{
					success: false,
					error: 'A report already exists for this issue. Contact support for more help.'
				},
				{ status: 409 }
			);
		}
		throw error;
	}
};
