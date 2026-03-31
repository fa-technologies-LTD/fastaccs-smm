import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import { fundWallet, getTransactionByReference } from '$lib/services/wallet';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse the body first
		const body = await request.json();

		// Get webhook signature from headers (Korapay uses x-korapay-signature)
		const signature = request.headers.get('x-korapay-signature');

		if (!signature) {
			console.error('No signature in webhook');
			return json({ success: false, error: 'No signature provided' }, { status: 400 });
		}

		const event = body.event;
		const data = body.data;

		// Verify webhook signature (Korapay signs only the 'data' object)
		if (!verifyWebhookSignature(signature, data)) {
			console.error('Invalid webhook signature');
			return json({ success: false, error: 'Invalid signature' }, { status: 401 });
		}

		// Handle different webhook events
		switch (event) {
			case 'charge.success': {
				// Payment successful
				const reference = data.reference;

				// Verify the payment
				const verificationResult = await verifyPayment(reference);

				if (!verificationResult.success) {
					console.error('Payment verification failed in webhook:', reference);
					return json({ success: false });
				}

				// Check if this is a wallet funding transaction (starts with WLT_)
				if (reference.startsWith('WLT_')) {
					// Extract userId from reference or metadata
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
					const fundResult = await fundWallet(userId, amount, reference, 'korapay');

					if (fundResult.success) {
						console.log('Wallet funded successfully:', userId, amount);
					} else {
						console.error('Failed to fund wallet:', fundResult.error);
					}

					return json({ success: true });
				}

				// Handle order payment
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

				} catch (error) {
					console.error('Account allocation failed in webhook:', error);
					// Keep status as 'paid' for manual processing
				}

				break;
			}

			case 'charge.failed': {
				// Payment failed
				const reference = data.reference;

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
				}

				break;
			}

			default:
				// Log unhandled events
				console.log('Unhandled webhook event:', event);
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
