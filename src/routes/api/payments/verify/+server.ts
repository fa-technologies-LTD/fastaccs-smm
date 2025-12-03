import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { reference } = await request.json();

		if (!reference) {
			return json({ success: false, error: 'Payment reference is required' }, { status: 400 });
		}

		// Verify payment with Paystack
		const verificationResult = await verifyPayment(reference);

		if (!verificationResult.success) {
			return json(
				{
					success: false,
					error: 'Payment verification failed',
					status: verificationResult.status
				},
				{ status: 400 }
			);
		}

		// Get order from payment metadata
		const orderId = verificationResult.metadata?.orderId as string;

		if (!orderId) {
			return json(
				{ success: false, error: 'Order ID not found in payment metadata' },
				{ status: 400 }
			);
		}

		// Get order
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
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

		// Check if order is already completed
		if (order.status === 'completed' || order.status === 'paid') {
			return json({
				success: true,
				message: 'Order already processed',
				orderId: order.id
			});
		}

		// Update order with payment details
		await prisma.order.update({
			where: { id: orderId },
			data: {
				status: 'paid',
				paymentReference: reference,
				paymentStatus: 'success',
				paymentChannel: verificationResult.channel,
				paidAt: verificationResult.paidAt || new Date()
			}
		});

		// Allocate accounts from inventory
		try {
			await allocateAccountsForOrder(orderId);

			// Mark order as completed
			await prisma.order.update({
				where: { id: orderId },
				data: { status: 'completed' }
			});
		} catch (allocationError) {
			// Payment succeeded but allocation failed
			// Keep status as 'paid' and handle manually
			console.error('Account allocation error:', allocationError);
			return json({
				success: true,
				warning: 'Payment successful but account allocation pending. Contact support.',
				orderId: order.id,
				status: 'paid'
			});
		}

		return json({
			success: true,
			message: 'Payment verified and order completed',
			orderId: order.id,
			status: 'completed',
			amount: verificationResult.amount,
			currency: verificationResult.currency
		});
	} catch (error) {
		console.error('Payment verification error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to verify payment'
			},
			{ status: 500 }
		);
	}
};
