import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Read raw body first for signature verification
		const rawBody = await request.text();

		const signature = request.headers.get('monnify-signature');

		if (!signature) {
			console.error('Monnify webhook: missing signature header');
			return json({ success: false, error: 'No signature provided' }, { status: 400 });
		}

		// Verify signature against raw body
		if (!verifyWebhookSignature(signature, rawBody)) {
			console.error('Monnify webhook: invalid signature');
			return json({ success: false, error: 'Invalid signature' }, { status: 401 });
		}

		const body = JSON.parse(rawBody);
		const eventType: string = body.eventType;
		const eventData = body.eventData;

		switch (eventType) {
			case 'SUCCESSFUL_TRANSACTION': {
				const transactionReference: string = eventData?.transactionReference;

				if (!transactionReference) {
					console.error('Monnify webhook: missing transactionReference');
					return json({ success: false });
				}

				// Verify with Monnify API before acting
				const verificationResult = await verifyPayment(transactionReference);

				if (!verificationResult.success) {
					console.error('Monnify webhook: payment verification failed for', transactionReference);
					return json({ success: false });
				}

				const orderId = verificationResult.metaData?.orderId as string;

				if (!orderId) {
					console.error(
						'Monnify webhook: no orderId in transaction metadata',
						transactionReference
					);
					return json({ success: false });
				}

				const order = await prisma.order.findUnique({
					where: { id: orderId }
				});

				if (!order) {
					console.error('Monnify webhook: order not found', orderId);
					return json({ success: false });
				}

				// Idempotency check
				if (order.status === 'completed' || order.status === 'paid') {
					return json({ success: true, message: 'Already processed' });
				}

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

				try {
					await allocateAccountsForOrder(orderId);
					await prisma.order.update({
						where: { id: orderId },
						data: { status: 'completed' }
					});
				} catch (allocationError) {
					console.error('Monnify webhook: account allocation failed for', orderId, allocationError);
					// Keep status as 'paid' for manual processing
				}

				break;
			}

			case 'FAILED_TRANSACTION': {
				const transactionReference: string = eventData?.transactionReference;
				const paymentReference: string = eventData?.paymentReference;

				const order = await prisma.order.findFirst({
					where: {
						OR: [{ paymentReference: paymentReference }, { paymentReference: transactionReference }]
					}
				});

				if (order) {
					// Never downgrade a successfully paid/completed order.
					if (order.status !== 'completed' && order.status !== 'paid') {
						await prisma.order.update({
							where: { id: order.id },
							data: {
								paymentStatus: 'failed',
								status: 'cancelled'
							}
						});
					}
				}

				break;
			}

			default:
				console.log('Monnify webhook: unhandled event type', eventType);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Monnify webhook processing error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Webhook processing failed'
			},
			{ status: 500 }
		);
	}
};
