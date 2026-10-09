import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { listRefundAnalyticsReview } from '$lib/services/refund-analytics';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		return json({ error: 'Unauthorized' }, { status: 401 });
	const [webhooks, refunds, refundAnalytics] = await Promise.all([
		prisma.paymentWebhookInbox.findMany({
			where: { status: { not: 'processed' } },
			orderBy: { receivedAt: 'asc' },
			take: 50,
			select: {
				id: true,
				status: true,
				attempts: true,
				lastError: true,
				receivedAt: true,
				nextAttemptAt: true
			}
		}),
		prisma.refundRecoveryTask.findMany({
			where: { status: { not: 'completed' } },
			orderBy: { createdAt: 'asc' },
			take: 50,
			select: {
				id: true,
				orderId: true,
				status: true,
				attempts: true,
				createdAt: true,
				nextAttemptAt: true
			}
		}),
		listRefundAnalyticsReview()
	]);
	return json({ webhooks, refunds, refundAnalytics });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json().catch(() => null);
	if (
		!body ||
		typeof body.id !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)
	)
		return json({ error: 'Invalid recovery ID' }, { status: 400 });
	const result = await prisma.$transaction(async (tx) => {
		const updated = await tx.paymentWebhookInbox.updateMany({
			where: { id: body.id, status: 'quarantined' },
			data: {
				status: 'pending',
				attempts: 0,
				nextAttemptAt: new Date(),
				leaseExpiresAt: null,
				lastError: null
			}
		});
		if (updated.count)
			await tx.adminAuditLog.create({
				data: {
					actorUserId: locals.user!.id,
					action: 'payment_webhook_retry_requested',
					resourceType: 'payment_webhook_inbox',
					resourceId: body.id,
					description: 'Requested verified webhook reprocessing; no payment review was released.'
				}
			});
		return updated.count;
	});
	return result
		? json({ success: true })
		: json({ error: 'Only held webhook events can be retried.' }, { status: 409 });
};
