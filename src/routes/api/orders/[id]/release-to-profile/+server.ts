import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { settleSuccessfulPayment } from '$lib/services/payment-settlement';
import { MANUAL_RELEASE_CHANNEL } from '$lib/helpers/order-revenue.server';

// POST /api/orders/[id]/release-to-profile
// OWNER-ONLY (FULL_ADMIN). Marks a pending order paid and releases its logs to
// the order's own user profile — WITHOUT counting as revenue (tagged with the
// manual-release payment channel, which is excluded from all revenue/analytics).
// Used by the owner to self-offload specific logs. Never available to assistants.
export const POST: RequestHandler = async ({ params, locals }) => {
	if (locals.adminContext?.role !== 'FULL_ADMIN') {
		return json({ error: 'Owner-only action.' }, { status: 403 });
	}

	const order = await prisma.order.findUnique({
		where: { id: params.id },
		select: {
			id: true,
			totalAmount: true,
			currency: true,
			paymentStatus: true,
			status: true
		}
	});

	if (!order) {
		return json({ error: 'Order not found' }, { status: 404 });
	}
	if (order.paymentStatus === 'paid' || order.status === 'completed') {
		return json({ error: 'Order is already paid or completed.' }, { status: 409 });
	}

	// Reuse the real payment-settlement path (mark paid → allocate logs), passing
	// the order's own total so the amount check passes, and the manual-release
	// channel so it never lands in revenue.
	const result = await settleSuccessfulPayment({
		orderId: order.id,
		source: 'admin_release',
		paymentReference: `ADMIN-RELEASE-${order.id}`,
		channel: MANUAL_RELEASE_CHANNEL,
		paidAt: new Date(),
		amountPaid: Number(order.totalAmount),
		currency: order.currency
	});

	if (!result.success) {
		return json(
			{ error: result.error || 'Release failed', status: result.status },
			{ status: 400 }
		);
	}

	return json({ success: true, status: result.status, orderId: order.id });
};
