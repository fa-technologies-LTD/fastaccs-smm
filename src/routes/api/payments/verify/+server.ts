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

		const {
			transactionReference,
			paymentReference,
			orderId: requestedOrderId
		} = await request.json();

		if (!transactionReference && !paymentReference) {
			if (!requestedOrderId) {
				return json(
					{ success: false, error: 'Transaction reference is required' },
					{ status: 400 }
				);
			}

			const order = await prisma.order.findUnique({ where: { id: requestedOrderId } });

			if (!order) {
				return json({ success: false, error: 'Order not found' }, { status: 404 });
			}

			if (order.userId !== locals.user.id) {
				return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
			}

			if (order.status !== 'completed' && order.status !== 'paid') {
				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: 'cancelled',
						paymentStatus: 'failed'
					}
				});
			}

			return json(
				{ success: false, error: 'Payment was cancelled', status: 'cancelled' },
				{ status: 400 }
			);
		}

		// Verify payment with Monnify (accepts either reference type)
		const verificationResult = await verifyPayment(transactionReference || paymentReference);

		if (!verificationResult.success) {
			const failedOrder = requestedOrderId
				? await prisma.order.findUnique({ where: { id: requestedOrderId } })
				: paymentReference
					? await prisma.order.findFirst({ where: { paymentReference } })
					: null;

			if (failedOrder && failedOrder.userId === locals.user.id) {
				if (failedOrder.status !== 'completed' && failedOrder.status !== 'paid') {
					await prisma.order.update({
						where: { id: failedOrder.id },
						data: {
							status: 'cancelled',
							paymentStatus: 'failed'
						}
					});
				}
			}

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
		const orderId = (verificationResult.metaData?.orderId as string) || requestedOrderId;

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
				paymentReference: verificationResult.paymentReference,
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
			// Payment succeeded but allocation failed — keep as 'paid' for manual handling
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
			amount: verificationResult.amountPaid,
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
