import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { pollPhoneRentalSms } from '$lib/services/phone-fulfillment';
import { hasAdminPermission } from '$lib/auth/admin-roles';

// The first poll on a pending order kicks off the rent SWEEP (up to ~9s) + persist; give the
// function headroom so it can never be killed mid-rent (which would orphan a paid-for number).
export const config = { maxDuration: 30 };

// Live OTP poll for a Numbers order. Owner (or admin) only.
export const GET: RequestHandler = async ({ params, locals }) => {
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

	const result = await pollPhoneRentalSms(orderItemId);
	return json(result);
};
