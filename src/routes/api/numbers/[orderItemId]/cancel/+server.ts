import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { userCancelPhoneRental } from '$lib/services/phone-fulfillment';
import { hasAdminPermission } from '$lib/auth/admin-roles';

// Buyer-initiated cancel of a Numbers order (refund to store credit if no code arrived).
// Owner (or admin) only. The service enforces the 2-minute window and the "code = final" rule.
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orderItemId = params.orderItemId;
	if (!orderItemId) {
		return json({ error: 'Missing order item' }, { status: 400 });
	}

	const orderItem = await prisma.orderItem.findUnique({
		where: { id: orderItemId },
		select: { order: { select: { userId: true } } }
	});
	if (!orderItem) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	const isOwner = orderItem.order.userId === locals.user.id;
	const isAdmin = hasAdminPermission(locals.adminContext, 'admin:access');
	if (!isOwner && !isAdmin) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const result = await userCancelPhoneRental(orderItemId);
	return json(result);
};
