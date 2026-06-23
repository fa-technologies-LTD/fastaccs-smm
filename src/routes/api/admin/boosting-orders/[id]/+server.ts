import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';

const VALID_STATUSES = ['pending', 'in_progress', 'completed'] as const;
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
		select: { id: true, orderId: true, boostTargetUrl: true }
	});
	if (!existing || !existing.boostTargetUrl) {
		return json({ success: false, data: null, error: 'Boosting order item not found' }, { status: 404 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		status?: unknown;
		providerReference?: unknown;
	};

	const data: {
		boostFulfillmentStatus?: BoostFulfillmentStatus;
		boostProviderReference?: string | null;
		boostCompletedAt?: Date | null;
	} = {};

	if (body.status !== undefined) {
		if (!isValidStatus(body.status)) {
			return json({ success: false, data: null, error: 'Invalid status' }, { status: 400 });
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

	const updated = await prisma.orderItem.update({
		where: { id: orderItemId },
		data
	});

	if (data.boostFulfillmentStatus !== undefined) {
		const siblingItems = await prisma.orderItem.findMany({
			where: { orderId: existing.orderId, boostTargetUrl: { not: null } },
			select: { boostFulfillmentStatus: true }
		});
		const allCompleted = siblingItems.every((item) => item.boostFulfillmentStatus === 'completed');

		await prisma.order.update({
			where: { id: existing.orderId },
			data: allCompleted
				? { status: 'completed', deliveryStatus: 'delivered' }
				: { status: 'paid', deliveryStatus: 'processing' }
		});
	}

	return json({ success: true, data: updated, error: null });
};
