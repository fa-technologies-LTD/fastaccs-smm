import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import { fundWallet, getTransactionByReference } from '$lib/services/wallet';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Get webhook signature from headers
		const signature = request.headers.get('x-paystack-signature');

		if (!signature) {
			return json({ success: false, error: 'No signature provided' }, { status: 400 });
		}

		// Get raw body as text for signature verification
		const body = await request.text();

		// Verify webhook signature
		if (!verifyWebhookSignature(signature, body)) {
			return json({ success: false, error: 'Invalid signature' }, { status: 401 });
		}

		// Parse the body
		const event = JSON.parse(body);

		// Handle different webhook events
		switch (event.event) {
			case 'charge.success': {
				// Payment successful
				const paymentData = event.data;
				const reference = paymentData.reference;

				// Verify the payment
				const verificationResult = await verifyPayment(reference);

				if (!verificationResult.success) {
					console.error('Payment verification failed in webhook:', reference);
					return json({ success: false });
				}

				// Check if this is a wallet funding transaction
				if (reference.startsWith('wallet_')) {
					// Extract userId from reference
					const metadata = verificationResult.metadata || {};
					const userId = metadata.userId as string;
					const amount = verificationResult.amount;

					if (!userId || !amount) {
						console.error('Missing userId or amount in wallet funding:', reference);
						return json({ success: false });
					}

					// Check if already processed
					const existing = await getTransactionByReference(reference);
					if (existing.success) {
						return json({ success: true, message: 'Already processed' });
					}

					// Fund the wallet
					const fundResult = await fundWallet(userId, amount, reference, 'paystack');

					if (fundResult.success) {
						console.log('Wallet funded successfully:', userId, amount);
					} else {
						console.error('Failed to fund wallet:', fundResult.error);
					}

					return json({ success: true });
				}

				// Handle order payment (existing logic)
				const orderId = verificationResult.metadata?.orderId as string;

				if (!orderId) {
					console.error('Order ID not found in payment metadata:', reference);
					return json({ success: false });
				}

				// Get order
				const order = await prisma.order.findUnique({
					where: { id: orderId }
				});

				if (!order) {
					console.error('Order not found:', orderId);
					return json({ success: false });
				}

				// Skip if already processed
				if (order.status === 'completed' || order.status === 'paid') {
					return json({ success: true, message: 'Already processed' });
				}

				// Update order status to paid
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

				// Allocate accounts
				try {
					await allocateAccountsForOrder(orderId);

					// Mark as completed
					await prisma.order.update({
						where: { id: orderId },
						data: { status: 'completed' }
					});

					console.log('Order completed via webhook:', orderId);
				} catch (error) {
					console.error('Account allocation failed in webhook:', error);
					// Keep status as 'paid' for manual processing
				}

				break;
			}

			case 'charge.failed': {
				// Payment failed
				const paymentData = event.data;
				const reference = paymentData.reference;

				// Find order by reference
				const order = await prisma.order.findFirst({
					where: { paymentReference: reference }
				});

				if (order) {
					await prisma.order.update({
						where: { id: order.id },
						data: {
							paymentStatus: 'failed',
							status: 'cancelled'
						}
					});

					console.log('Order cancelled due to failed payment:', order.id);
				}

				break;
			}

			default:
				// Log unhandled events
				console.log('Unhandled webhook event:', event.event);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Webhook processing error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Webhook processing failed'
			},
			{ status: 500 }
		);
	}
};
