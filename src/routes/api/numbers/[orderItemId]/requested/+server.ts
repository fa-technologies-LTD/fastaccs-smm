import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';

// The customer tapped "I've requested the code". We stamp the authoritative server-side time the
// replacement wait runs from (see customerRetryPhoneRental). Set once per number (only while it's
// the active awaiting number and not already stamped). Owner (or admin) only.
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

	await prisma.phoneRental.updateMany({
		where: { orderItemId, status: 'awaiting_sms', otpRequestedAt: null },
		data: { otpRequestedAt: new Date() }
	});
	return json({ ok: true });
};
