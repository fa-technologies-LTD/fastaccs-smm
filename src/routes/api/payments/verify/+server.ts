import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

function sanitizeOrderId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	// Guard against malformed callback URLs that may include extra query fragments.
	const stripped = trimmed.split('?')[0].split('&')[0].trim();
	return stripped || null;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStatus(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toUpperCase();
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const {
			transactionReference: rawTransactionReference,
			paymentReference: rawPaymentReference,
			orderId: requestedOrderId,
			callbackContext
		} = await request.json();

		const transactionReference =
			typeof rawTransactionReference === 'string' && rawTransactionReference.trim()
				? rawTransactionReference.trim()
				: null;
		const paymentReference =
			typeof rawPaymentReference === 'string' && rawPaymentReference.trim()
				? rawPaymentReference.trim()
				: null;

		const callbackQueryKeys = Array.isArray(callbackContext?.queryKeys)
			? callbackContext.queryKeys
					.filter((value: unknown): value is string => typeof value === 'string')
					.slice(0, 50)
			: [];

		console.info('[payments.verify] request_received', {
			userId: locals.user.id,
			orderId: requestedOrderId ?? null,
			paymentReference: paymentReference ?? null,
			transactionReference: transactionReference ?? null,
			callbackQueryKeys
		});

		const safeRequestedOrderId = sanitizeOrderId(requestedOrderId);
		const validRequestedOrderId =
			safeRequestedOrderId && isUuid(safeRequestedOrderId) ? safeRequestedOrderId : null;
		let referenceToVerify = transactionReference || paymentReference;

		if (!referenceToVerify) {
			if (!validRequestedOrderId) {
				console.warn('[payments.verify] pending_missing_reference_no_order', {
					userId: locals.user.id,
					callbackQueryKeys
				});

				return json(
					{
						success: false,
						pending: true,
						status: 'pending',
						message: 'Payment confirmation pending. Please wait while we confirm your transaction.'
					},
					{ status: 202 }
				);
			}

			const order = await prisma.order.findUnique({ where: { id: validRequestedOrderId } });

			if (!order) {
				return json({ success: false, error: 'Order not found' }, { status: 404 });
			}

			if (order.userId !== locals.user.id) {
				return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
			}

			// If payment already succeeded (possibly via webhook), do not downgrade status.
			if (order.status === 'completed' || order.status === 'paid') {
				console.info('[payments.verify] redirect_without_reference_already_paid', {
					orderId: order.id,
					status: order.status
				});

				return json({
					success: true,
					message: 'Order already processed',
					orderId: order.id
				});
			}

			if (!order.paymentReference) {
				console.warn('[payments.verify] pending_missing_reference_no_order_payment_reference', {
					orderId: order.id
				});

				return json(
					{
						success: false,
						pending: true,
						status: 'pending',
						message: 'Payment received. We are still waiting for confirmation from Monnify.'
					},
					{ status: 202 }
				);
			}

			referenceToVerify = order.paymentReference;
			console.info('[payments.verify] using_order_payment_reference_fallback', {
				orderId: order.id,
				paymentReference: order.paymentReference
			});
		}

		// Verify payment with Monnify (accepts either reference type)
		const verificationResult = await verifyPayment(referenceToVerify);

		console.info('[payments.verify] gateway_verification_result', {
			userId: locals.user.id,
			orderId: validRequestedOrderId,
			success: verificationResult.success,
			status: verificationResult.status,
			paymentReference: verificationResult.paymentReference || paymentReference || null,
			transactionReference: verificationResult.transactionReference || transactionReference || null,
			referenceUsed: referenceToVerify
		});

		const normalizedStatus = normalizeStatus(verificationResult.status);

		if (!verificationResult.success) {
			const failedOrder = validRequestedOrderId
				? await prisma.order.findUnique({ where: { id: validRequestedOrderId } })
				: paymentReference || verificationResult.paymentReference
					? await prisma.order.findFirst({
							where: { paymentReference: paymentReference || verificationResult.paymentReference }
						})
					: null;

			// Only cancel when gateway confirms an explicit FAILED transaction.
			if (normalizedStatus === 'FAILED') {
				if (failedOrder && failedOrder.userId === locals.user.id) {
					if (failedOrder.status !== 'completed' && failedOrder.status !== 'paid') {
						await prisma.order.update({
							where: { id: failedOrder.id },
							data: {
								status: 'cancelled',
								paymentStatus: 'failed'
							}
						});

						console.info('[payments.verify] cancelled_gateway_failed', {
							orderId: failedOrder.id,
							gatewayStatus: normalizedStatus
						});
					}
				}

				return json(
					{
						success: false,
						error: 'Payment failed',
						status: normalizedStatus
					},
					{ status: 400 }
				);
			}

			console.info('[payments.verify] pending_gateway_unconfirmed', {
				userId: locals.user.id,
				orderId: validRequestedOrderId,
				status: normalizedStatus || null,
				referenceUsed: referenceToVerify
			});

			return json(
				{
					success: false,
					pending: true,
					status: normalizedStatus || 'PENDING',
					message: 'Payment received. We are still confirming with Monnify.'
				},
				{ status: 202 }
			);
		}

		// Get order from payment metadata
		const metadataOrderId = sanitizeOrderId(verificationResult.metaData?.orderId);
		const orderByPaymentReference =
			!metadataOrderId && !validRequestedOrderId && verificationResult.paymentReference
				? await prisma.order.findFirst({
						where: { paymentReference: verificationResult.paymentReference },
						select: { id: true }
					})
				: null;
		const orderId = metadataOrderId || validRequestedOrderId || orderByPaymentReference?.id || null;

		if (!orderId || !isUuid(orderId)) {
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
			console.info('[payments.verify] already_processed', {
				orderId: order.id,
				status: order.status
			});

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
				paymentReference: verificationResult.paymentReference || referenceToVerify,
				paymentStatus: 'success',
				paymentChannel: verificationResult.channel,
				paidAt: verificationResult.paidAt || new Date()
			}
		});

		console.info('[payments.verify] marked_paid', {
			orderId,
			paymentReference: verificationResult.paymentReference,
			status: verificationResult.status
		});

		// Allocate accounts from inventory
		try {
			await allocateAccountsForOrder(orderId);

			// Mark order as completed
			await prisma.order.update({
				where: { id: orderId },
				data: { status: 'completed' }
			});

			console.info('[payments.verify] completed_after_allocation', {
				orderId
			});
		} catch (allocationError) {
			// Payment succeeded but allocation failed — keep as 'paid' for manual handling
			console.error('Account allocation error:', allocationError);
			console.warn('[payments.verify] allocation_pending_manual', {
				orderId
			});
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
