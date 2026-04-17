import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

const SUCCESS_STATUSES = new Set(['PAID', 'OVERPAID']);
const PENDING_STATUSES = new Set([
	'',
	'PENDING',
	'PROCESSING',
	'PENDING_PAYMENT',
	'PARTIALLY_PAID',
	'NOT_FOUND',
	'ERROR',
	'UNKNOWN'
]);
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED']);
const FAILED_STATUSES = new Set(['FAILED', 'REJECTED', 'REJECTED_PAYMENT']);

type FailureKind = 'cancelled' | 'failed';

function pickString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function sanitizeOrderId(value: unknown): string | null {
	const parsed = pickString(value);
	if (!parsed) return null;

	// Guard against malformed callback values carrying extra fragments.
	const stripped = parsed.split('?')[0].split('&')[0].trim();
	return stripped || null;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStatus(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toUpperCase();
}

function isSuccessStatus(status: string): boolean {
	return SUCCESS_STATUSES.has(status);
}

function isPendingStatus(status: string): boolean {
	return PENDING_STATUSES.has(status);
}

function getFailureKind(status: string): FailureKind | null {
	if (!status) return null;
	if (CANCELLED_STATUSES.has(status)) return 'cancelled';
	if (FAILED_STATUSES.has(status)) return 'failed';
	return null;
}

function getFailureMessage(kind: FailureKind, fallbackMessage: string | null): string {
	if (fallbackMessage) return fallbackMessage;
	return kind === 'cancelled'
		? 'Payment was cancelled before completion.'
		: 'Payment failed. Please try again.';
}

function buildPendingResponse(message: string, status = 'PENDING') {
	return json(
		{
			success: false,
			pending: true,
			state: 'PENDING_CONFIRMATION',
			status,
			message
		},
		{ status: 202 }
	);
}

function buildFailureResponse(
	kind: FailureKind,
	status: string,
	message: string,
	orderId: string | null = null
) {
	return json(
		{
			success: false,
			cancelled: kind === 'cancelled',
			failed: kind === 'failed',
			state: kind === 'cancelled' ? 'CANCELLED' : 'FAILED',
			status,
			orderId,
			error: kind === 'failed' ? message : undefined,
			message
		},
		{ status: 400 }
	);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const {
			transactionReference: rawTransactionReference,
			paymentReference: rawPaymentReference,
			orderId: requestedOrderId,
			callbackStatus: rawCallbackStatus,
			callbackMessage: rawCallbackMessage,
			callbackContext
		} = await request.json();

		const transactionReference = pickString(rawTransactionReference);
		const paymentReference = pickString(rawPaymentReference);
		const callbackStatus = normalizeStatus(rawCallbackStatus);
		const callbackMessage = pickString(rawCallbackMessage);

		const callbackQueryKeys = Array.isArray(callbackContext?.queryKeys)
			? callbackContext.queryKeys
					.filter((value: unknown): value is string => typeof value === 'string')
					.slice(0, 50)
			: [];

		const safeRequestedOrderId = sanitizeOrderId(requestedOrderId);
		const validRequestedOrderId =
			safeRequestedOrderId && isUuid(safeRequestedOrderId) ? safeRequestedOrderId : null;

		console.info('[payments.verify] request_received', {
			userId: locals.user.id,
			orderId: validRequestedOrderId,
			paymentReference: paymentReference ?? null,
			transactionReference: transactionReference ?? null,
			callbackStatus: callbackStatus || null,
			callbackQueryKeys
		});

		const orderById = validRequestedOrderId
			? await prisma.order.findUnique({ where: { id: validRequestedOrderId } })
			: null;

		if (validRequestedOrderId && !orderById) {
			return json({ success: false, error: 'Order not found' }, { status: 404 });
		}

		if (orderById && orderById.userId !== locals.user.id) {
			return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
		}

		if (orderById && (orderById.status === 'completed' || orderById.status === 'paid')) {
			return json({
				success: true,
				state: 'SUCCESS',
				status: orderById.status.toUpperCase(),
				orderId: orderById.id,
				message: 'Order already processed'
			});
		}

		let referenceToVerify =
			transactionReference || paymentReference || orderById?.paymentReference || null;

		if (!referenceToVerify) {
			const callbackFailureKind = getFailureKind(callbackStatus);

			if (
				callbackFailureKind &&
				orderById &&
				orderById.status !== 'completed' &&
				orderById.status !== 'paid'
			) {
				await prisma.order.update({
					where: { id: orderById.id },
					data: {
						status: 'cancelled',
						paymentStatus: callbackFailureKind === 'cancelled' ? 'cancelled' : 'failed'
					}
				});
			}

			if (callbackFailureKind) {
				return buildFailureResponse(
					callbackFailureKind,
					callbackStatus || (callbackFailureKind === 'cancelled' ? 'CANCELLED' : 'FAILED'),
					getFailureMessage(callbackFailureKind, callbackMessage),
					orderById?.id || null
				);
			}

			return buildPendingResponse(
				'Payment confirmation pending. Please wait while we confirm your transaction.'
			);
		}

		const verificationResult = await verifyPayment(referenceToVerify);
		const gatewayStatus = normalizeStatus(verificationResult.status);

		console.info('[payments.verify] gateway_verification_result', {
			userId: locals.user.id,
			orderId: validRequestedOrderId,
			success: verificationResult.success,
			status: gatewayStatus || null,
			paymentReference: verificationResult.paymentReference || paymentReference || null,
			transactionReference: verificationResult.transactionReference || transactionReference || null,
			referenceUsed: referenceToVerify
		});

		const resolvedStatus = gatewayStatus || callbackStatus;

		if (verificationResult.success || isSuccessStatus(gatewayStatus)) {
			const metadataOrderId = sanitizeOrderId(verificationResult.metaData?.orderId);
			const validMetadataOrderId =
				metadataOrderId && isUuid(metadataOrderId) ? metadataOrderId : null;

			const orderByGatewayPaymentReference =
				!validMetadataOrderId && !validRequestedOrderId && verificationResult.paymentReference
					? await prisma.order.findFirst({
							where: { paymentReference: verificationResult.paymentReference },
							select: { id: true }
						})
					: null;

			const orderId =
				validMetadataOrderId ||
				validRequestedOrderId ||
				orderById?.id ||
				orderByGatewayPaymentReference?.id ||
				null;

			if (!orderId || !isUuid(orderId)) {
				return json(
					{ success: false, error: 'Order ID not found in payment metadata' },
					{ status: 400 }
				);
			}

			const order =
				orderById && orderById.id === orderId
					? orderById
					: await prisma.order.findUnique({ where: { id: orderId } });

			if (!order) {
				return json({ success: false, error: 'Order not found' }, { status: 404 });
			}

			if (order.userId !== locals.user.id) {
				return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
			}

			if (order.status === 'completed' || order.status === 'paid') {
				return json({
					success: true,
					state: 'SUCCESS',
					status: order.status.toUpperCase(),
					orderId: order.id,
					message: 'Order already processed'
				});
			}

			const paidTransition = await prisma.order.updateMany({
				where: {
					id: order.id,
					status: { notIn: ['paid', 'completed'] }
				},
				data: {
					status: 'paid',
					paymentReference:
						verificationResult.paymentReference || order.paymentReference || referenceToVerify,
					paymentStatus: 'success',
					paymentChannel: verificationResult.channel,
					paidAt: verificationResult.paidAt || new Date()
				}
			});

			if (paidTransition.count === 0) {
				const latestOrder = await prisma.order.findUnique({
					where: { id: order.id },
					select: { status: true }
				});

				if (latestOrder && (latestOrder.status === 'paid' || latestOrder.status === 'completed')) {
					return json({
						success: true,
						state: 'SUCCESS',
						status: latestOrder.status.toUpperCase(),
						orderId: order.id,
						message: 'Order already processed'
					});
				}
			}

			const allocationResult = await allocateAccountsForOrder(order.id);
			if (!allocationResult.success) {
				console.warn('[payments.verify] allocation_pending_manual', {
					orderId: order.id,
					error: allocationResult.error || null
				});

				return json({
					success: true,
					state: 'SUCCESS',
					warning: 'Payment successful but account allocation pending. Contact support.',
					orderId: order.id,
					status: 'PAID'
				});
			}

			return json({
				success: true,
				state: 'SUCCESS',
				message: 'Payment verified and order completed',
				orderId: order.id,
				status: 'COMPLETED',
				amount: verificationResult.amountPaid,
				currency: verificationResult.currency
			});
		}

		const failureKind = getFailureKind(resolvedStatus);

		if (failureKind) {
			let failedOrder = orderById;
			const referenceCandidates = [
				verificationResult.paymentReference,
				paymentReference,
				referenceToVerify
			].filter((value): value is string => Boolean(value));

			if (!failedOrder) {
				for (const candidate of referenceCandidates) {
					const foundOrder = await prisma.order.findFirst({
						where: { paymentReference: candidate }
					});
					if (foundOrder) {
						failedOrder = foundOrder;
						break;
					}
				}
			}

			if (
				failedOrder &&
				failedOrder.userId === locals.user.id &&
				failedOrder.status !== 'completed' &&
				failedOrder.status !== 'paid'
			) {
				await prisma.order.update({
					where: { id: failedOrder.id },
					data: {
						status: 'cancelled',
						paymentStatus: failureKind === 'cancelled' ? 'cancelled' : 'failed'
					}
				});
			}

			return buildFailureResponse(
				failureKind,
				resolvedStatus || (failureKind === 'cancelled' ? 'CANCELLED' : 'FAILED'),
				getFailureMessage(failureKind, callbackMessage),
				failedOrder?.id || null
			);
		}

		if (isPendingStatus(resolvedStatus)) {
			return buildPendingResponse(
				'Payment received. We are still confirming with Monnify.',
				resolvedStatus || 'PENDING'
			);
		}

		return buildPendingResponse(
			'We are still confirming your payment status. Please wait a moment and retry.',
			resolvedStatus || 'PENDING'
		);
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
