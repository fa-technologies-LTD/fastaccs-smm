import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { customerRetryPhoneRental } from '$lib/services/phone-fulfillment';
import { hasAdminPermission } from '$lib/auth/admin-roles';

// Buyer-initiated "try another number": when no code arrived, swap to the next-best supplier
// without re-charging. Owner (or admin) only. The service enforces the wait window, the retry
// cap, and the "code = final, never dropped" rule.
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

	const result = await customerRetryPhoneRental(orderItemId);
	return json(result);
};
