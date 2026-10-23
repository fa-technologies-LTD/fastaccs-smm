import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';

/** Old tabs must not bypass the evidence and link-request resolution rules. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	const existing = await prisma.orderItem.findUnique({
		where: { id: params.id },
		include: { order: true }
	});
	if (!existing?.boostTargetUrl)
		return json({ success: false, error: 'Boosting order item not found' }, { status: 404 });
	if (!isOrderPaymentConfirmed(existing.order) || existing.order.deliveryStatus === 'refunded')
		return json(
			{ success: false, error: 'Only paid boosting orders can be updated.' },
			{ status: 409 }
		);
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object')
		return json({ success: false, error: 'Invalid update' }, { status: 400 });
	if (
		body.status !== undefined &&
		!['pending', 'in_progress', 'needs_link', 'completed', 'rejected'].includes(body.status)
	)
		return json({ success: false, error: 'Invalid status' }, { status: 400 });
	if (
		['needs_link', 'rejected'].includes(body.status) &&
		String(body.reason ?? '').trim().length < 3
	)
		return json(
			{ success: false, error: 'Please give the customer a clear reason.' },
			{ status: 400 }
		);
	return json(
		{
			success: false,
			error:
				'Refresh this page and use Resolve order. Direct status and supplier-reference changes cannot bypass the delivery review.',
			code: 'USE_ORDER_RESOLUTION'
		},
		{ status: 409 }
	);
};
