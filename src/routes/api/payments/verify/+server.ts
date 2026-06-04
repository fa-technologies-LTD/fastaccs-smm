import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import {
	getFailureKind,
	isPendingPaymentStatus,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import type { FailureKind } from '$lib/helpers/payment-status';
import { isVerifiedPaymentBoundToOrder } from '$lib/helpers/payment-binding';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { isPendingPaymentExpired } from '$lib/helpers/payment-expiry.server';
import {
	markPaymentPending,
	recoverPaidOrder,
	settleFailedPayment,
	settleSuccessfulPayment
} from '$lib/services/payment-settlement';

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

interface PendingOrderForExpiry {
	id: string;
	status: string;
	paymentStatus: string;
	createdAt: Date;
	paymentExpiresAt?: Date | null;
}

async function buildExpiredPendingOrderResponse(
	order: PendingOrderForExpiry,
	gatewayStatus: string
): Promise<Response | null> {
	if (order.status === 'paid' || order.status === 'completed' || order.paymentStatus === 'paid') {
		return null;
	}
	const expired = order.paymentExpiresAt
		? order.paymentExpiresAt.getTime() <= Date.now()
		: isPendingPaymentExpired(order.createdAt, gatewayStatus);
	if (!expired) return null;

	await settleFailedPayment({
		orderId: order.id,
		failureKind: 'cancelled',
		source: 'verify'
	});

	return buildFailureResponse(
		'cancelled',
		'EXPIRED',
		'Payment window expired before confirmation. Please place a fresh order if you still need these accounts.',
		order.id
	);
}

async function recoverPaidOrderIfNeeded(orderId: string) {
	const result = await recoverPaidOrder(orderId, 'verify');
	return {
		fulfilled: result.status === 'COMPLETED',
		warning: result.warning || result.error || null
	};
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
		const callbackStatus = normalizePaymentStatus(rawCallbackStatus);
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

		if (orderById?.status === 'completed') {
			await recoverPaidOrder(orderById.id, 'verify');
			return json({
				success: true,
				state: 'SUCCESS',
				status: orderById.status.toUpperCase(),
				orderId: orderById.id,
				message: 'Order already processed'
			});
		}

		if (orderById?.status === 'paid' || orderById?.paymentStatus === 'paid') {
			const recovered = await recoverPaidOrderIfNeeded(orderById.id);
			if (recovered.fulfilled) {
				return json({
					success: true,
					state: 'SUCCESS',
					status: 'COMPLETED',
					orderId: orderById.id,
					message: 'Order already processed'
				});
			}

			return json({
				success: true,
				state: 'SUCCESS',
				warning: recovered.warning,
				orderId: orderById.id,
				status: 'PAID'
			});
		}

		const referenceToVerify =
			transactionReference || paymentReference || orderById?.paymentReference || null;

		if (!referenceToVerify) {
			const callbackFailureKind = getFailureKind(callbackStatus);

			if (
				callbackFailureKind &&
				orderById &&
				orderById.status !== 'completed' &&
				orderById.status !== 'paid'
			) {
				await settleFailedPayment({
					orderId: orderById.id,
					failureKind: callbackFailureKind,
					source: 'verify'
				});
			} else if (orderById && orderById.status !== 'completed' && orderById.status !== 'paid') {
				const expiredResponse = await buildExpiredPendingOrderResponse(orderById, callbackStatus);
				if (expiredResponse) return expiredResponse;

				await markPaymentPending({
					orderId: orderById.id,
					gatewayStatus: callbackStatus,
					source: 'verify'
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
				'Waiting for payment confirmation from Monnify.',
				callbackStatus || 'PENDING'
			);
		}

		const verificationResult = await verifyPayment(referenceToVerify);
		const gatewayStatus = normalizePaymentStatus(verificationResult.status);

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

		if (verificationResult.success || isSuccessPaymentStatus(gatewayStatus)) {
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

			const order = (
				orderById && orderById.id === orderId
					? orderById
					: await prisma.order.findUnique({ where: { id: orderId } })
			)!;

			if (!order) {
				return json({ success: false, error: 'Order not found' }, { status: 404 });
			}

			if (order.userId !== locals.user.id) {
				return json({ success: false, error: 'Unauthorized access to order' }, { status: 403 });
			}

			const storedPaymentReference = pickString(order.paymentReference);
			const verifiedPaymentReference = pickString(verificationResult.paymentReference);

			if (
				!isVerifiedPaymentBoundToOrder({
					orderId: order.id,
					metadataOrderId: validMetadataOrderId,
					storedPaymentReference,
					verifiedPaymentReference
				})
			) {
				console.warn('[payments.verify] payment_order_binding_mismatch', {
					orderId: order.id,
					storedPaymentReference,
					verifiedPaymentReference,
					metadataOrderId: validMetadataOrderId
				});
				return json(
					{
						success: false,
						error: 'Verified payment does not belong to this order.'
					},
					{ status: 409 }
				);
			}

			const settlement = await settleSuccessfulPayment({
				orderId: order.id,
				source: 'verify',
				paymentReference:
					verificationResult.paymentReference || order.paymentReference || referenceToVerify,
				channel: verificationResult.channel,
				paidAt: verificationResult.paidAt,
				amountPaid: Number(verificationResult.amountPaid || verificationResult.amount || 0),
				currency: verificationResult.currency
			});

			if (!settlement.success) {
				return json(
					{
						success: false,
						failed: true,
						state: 'FAILED',
						status: settlement.status,
						orderId: order.id,
						error: settlement.error || 'Payment settlement failed.',
						message: settlement.error || 'Payment settlement failed.'
					},
					{ status: 400 }
				);
			}

			return json({
				success: true,
				state: 'SUCCESS',
				status: settlement.status,
				orderId: settlement.orderId,
				manualHandover: settlement.manualHandover === true,
				warning: settlement.warning || undefined,
				message:
					settlement.status === 'COMPLETED'
						? 'Payment verified and order completed'
						: 'Payment verified and fulfillment is in progress',
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
				await settleFailedPayment({
					orderId: failedOrder.id,
					failureKind,
					source: 'verify'
				});
			}

			return buildFailureResponse(
				failureKind,
				resolvedStatus || (failureKind === 'cancelled' ? 'CANCELLED' : 'FAILED'),
				getFailureMessage(failureKind, callbackMessage),
				failedOrder?.id || null
			);
		}

		if (isPendingPaymentStatus(resolvedStatus)) {
			if (orderById && orderById.status !== 'completed' && orderById.status !== 'paid') {
				const expiredResponse = await buildExpiredPendingOrderResponse(orderById, resolvedStatus);
				if (expiredResponse) return expiredResponse;

				await markPaymentPending({
					orderId: orderById.id,
					gatewayStatus: resolvedStatus,
					source: 'verify'
				});
			}

			return buildPendingResponse(
				'Waiting for payment confirmation from Monnify.',
				resolvedStatus || 'PENDING'
			);
		}

		if (orderById && orderById.status !== 'completed' && orderById.status !== 'paid') {
			const expiredResponse = await buildExpiredPendingOrderResponse(orderById, resolvedStatus);
			if (expiredResponse) return expiredResponse;
		}

		return buildPendingResponse(
			'Waiting for payment confirmation from Monnify.',
			resolvedStatus || 'PENDING'
		);
	} catch (error) {
		console.error('Payment verification error:', error);
		void sendCriticalAdminAlert({
			title: 'Payment verification endpoint error',
			message: error instanceof Error ? error.message : 'Unknown payment verification failure.',
			source: 'api.payments.verify',
			dedupeKey: 'payments-verify-endpoint-error'
		}).catch((notifyError) => {
			console.error('Failed to send admin alert for payment verification error:', notifyError);
		});
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to verify payment'
			},
			{ status: 500 }
		);
	}
};
