import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { initializeTransaction } from '$lib/services/monnify';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { orderId } = await request.json();

		if (!orderId) {
			return json({ success: false, error: 'Order ID is required' }, { status: 400 });
		}

		const order = await prisma.order.findUnique({ where: { id: orderId } });

		if (!order) {
			return json({ success: false, error: 'Order not found' }, { status: 404 });
		}

		if (order.userId !== locals.user.id) {
			return json({ success: false, error: 'Forbidden' }, { status: 403 });
		}

		if (order.status === 'paid' || order.status === 'completed') {
			return json({ success: false, error: 'Order has already been paid' }, { status: 400 });
		}

		const shortOrderId = orderId.substring(0, 8);
		const paymentReference = `ORD_${shortOrderId}_${Date.now()}`;
		const redirectUrl = `${url.origin}/checkout/verify?orderId=${encodeURIComponent(orderId)}`;

		console.info('[payments.initialize] starting', {
			orderId,
			userId: locals.user.id,
			paymentReference,
			amount: Number(order.totalAmount)
		});

		const result = await initializeTransaction({
			amount: Number(order.totalAmount),
			customerName: locals.user.fullName || locals.user.email || 'Customer',
			customerEmail: locals.user.email || '',
			paymentReference,
			paymentDescription: `Payment for order ${shortOrderId}`,
			redirectUrl,
			metaData: { orderId, userId: locals.user.id }
		});

		if (!result.success || !result.checkoutUrl) {
			return json(
				{ success: false, error: result.error || 'Failed to initialize payment' },
				{ status: 500 }
			);
		}

		await prisma.order.update({
			where: { id: orderId },
			data: {
				paymentReference,
				status: 'pending_payment',
				paymentStatus: 'pending'
			}
		});

		console.info('[payments.initialize] pending_payment', {
			orderId,
			paymentReference
		});

		return json({
			success: true,
			checkoutUrl: result.checkoutUrl,
			orderId,
			paymentReference
		});
	} catch (error) {
		console.error('Payment initialization error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to initialize payment'
			},
			{ status: 500 }
		);
	}
};
