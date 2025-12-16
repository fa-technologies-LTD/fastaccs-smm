import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { initializePayment, nairaToKobo } from '$lib/services/payment';
import { prisma } from '$lib/prisma';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { orderId } = await request.json();

		if (!orderId) {
			return json({ success: false, error: 'Order ID is required' }, { status: 400 });
		}

		// Get order details
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				user: true,
				orderItems: {
					include: {
						category: true
					}
				}
			}
		});

		if (!order) {
			return json({ success: false, error: 'Order not found' }, { status: 404 });
		}

		// Verify order belongs to user
		if (order.userId !== locals.user.id) {
			return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
		}

		// Check if order is already paid
		if (order.status === 'paid' || order.status === 'completed') {
			return json({ success: false, error: 'Order has already been paid' }, { status: 400 });
		}

		// Calculate total amount in kobo
		const totalInKobo = nairaToKobo(Number(order.totalAmount));

		// Generate reference for this payment
		// Korapay has 50 char limit: ORD_XXXXXXXX_TIMESTAMP (max 28 chars)
		const shortOrderId = order.id.substring(0, 8);
		const reference = `ORD_${shortOrderId}_${Date.now()}`;

		// Initialize payment with Korapay
		const paymentResult = await initializePayment({
			email: order.user?.email || order.guestEmail || '',
			amount: totalInKobo,
			reference,
			metadata: {
				orderId: order.id,
				userId: order.userId,
				orderItems: order.orderItems.length,
				customerName: order.user?.fullName || 'Guest'
			},
			narration: `Payment for Order ${order.id}`
		});

		if (!paymentResult.success) {
			return json(
				{ success: false, error: paymentResult.error || 'Failed to initialize payment' },
				{ status: 500 }
			);
		}

		// Update order with payment reference
		await prisma.order.update({
			where: { id: orderId },
			data: {
				paymentReference: paymentResult.reference,
				status: 'pending_payment'
			}
		});

		return json({
			success: true,
			authorizationUrl: paymentResult.authorizationUrl,
			reference: paymentResult.reference
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
