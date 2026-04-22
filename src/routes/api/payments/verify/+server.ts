import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import {
	getFailureKind,
	getFailureOrderStatus,
	getPendingPaymentPhase,
	isPendingPaymentStatus,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import type { FailureKind } from '$lib/helpers/payment-status';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import { sendOrderConfirmationEmailIfNeeded } from '$lib/services/email';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';

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

function isPaymentAmountValid(orderTotal: number, paidAmount: number): boolean {
	if (!Number.isFinite(orderTotal) || !Number.isFinite(paidAmount)) return false;
	return paidAmount + 0.01 >= orderTotal;
}

function isPaymentCurrencyValid(orderCurrency: string | null | undefined, paidCurrency: string): boolean {
	const expectedCurrency = String(orderCurrency || 'NGN').toUpperCase();
	return expectedCurrency === String(paidCurrency || 'NGN').toUpperCase();
}

async function recoverPaidOrderIfNeeded(orderId: string) {
	try {
		await sendOrderConfirmationEmailIfNeeded(orderId);
	} catch (emailError) {
		console.error('Failed to send order confirmation email for paid order recovery:', emailError);
	}

	const allocationResult = await allocateAccountsForOrder(orderId);
	if (allocationResult.success) {
		return { fulfilled: true, warning: null };
	}

	const latest = await prisma.order.findUnique({
		where: { id: orderId },
		select: { status: true }
	});

	if (latest?.status === 'completed') {
		return { fulfilled: true, warning: null };
	}

	return {
		fulfilled: false,
		warning: 'Payment successful but account allocation pending. Contact support.'
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
			return json({
				success: true,
				state: 'SUCCESS',
				status: orderById.status.toUpperCase(),
				orderId: orderById.id,
				message: 'Order already processed'
			});
		}

		if (orderById?.status === 'paid') {
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
				const nextStatus = getFailureOrderStatus(callbackFailureKind);
				await prisma.order.update({
					where: { id: orderById.id },
					data: {
						status: nextStatus,
						paymentStatus: callbackFailureKind === 'cancelled' ? 'cancelled' : 'failed'
					}
				});
				invalidateAdminStatsCache();

				logOrderStatusTransition({
					orderId: orderById.id,
					source: 'verify',
					fromStatus: orderById.status,
					toStatus: nextStatus,
					fromPaymentStatus: orderById.paymentStatus,
					toPaymentStatus: callbackFailureKind === 'cancelled' ? 'cancelled' : 'failed'
				});
			} else if (orderById && orderById.status !== 'completed' && orderById.status !== 'paid') {
				const nextPaymentStatus = getPendingPaymentPhase(callbackStatus);
				await prisma.order.update({
					where: { id: orderById.id },
					data: {
						status: 'pending_payment',
						paymentStatus: nextPaymentStatus
					}
				});
				invalidateAdminStatsCache();

				logOrderStatusTransition({
					orderId: orderById.id,
					source: 'verify',
					fromStatus: orderById.status,
					toStatus: 'pending_payment',
					fromPaymentStatus: orderById.paymentStatus,
					toPaymentStatus: nextPaymentStatus
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

			if (order.status === 'completed') {
				return json({
					success: true,
					state: 'SUCCESS',
					status: 'COMPLETED',
					orderId: order.id,
					message: 'Order already processed'
				});
			}

			if (order.status === 'paid') {
				const recovered = await recoverPaidOrderIfNeeded(order.id);
				if (recovered.fulfilled) {
					return json({
						success: true,
						state: 'SUCCESS',
						status: 'COMPLETED',
						orderId: order.id,
						message: 'Order already processed'
					});
				}

				return json({
					success: true,
					state: 'SUCCESS',
					warning: recovered.warning,
					orderId: order.id,
					status: 'PAID'
				});
			}

			const settledAmount = Number(verificationResult.amountPaid || verificationResult.amount || 0);
			const expectedAmount = Number(order.totalAmount);
			const currencyIsValid = isPaymentCurrencyValid(order.currency, verificationResult.currency);
			const amountIsValid = isPaymentAmountValid(expectedAmount, settledAmount);

			if (!currencyIsValid || !amountIsValid) {
				const mismatchMessage = !currencyIsValid
					? `Payment currency mismatch. Expected ${order.currency}, got ${verificationResult.currency}.`
					: `Payment amount mismatch. Expected ₦${expectedAmount.toLocaleString()}, got ₦${settledAmount.toLocaleString()}.`;

				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: 'failed',
						paymentStatus: 'failed'
					}
				});
				invalidateAdminStatsCache();

				logOrderStatusTransition({
					orderId: order.id,
					source: 'verify',
					fromStatus: order.status,
					toStatus: 'failed',
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: 'failed'
				});

				return json(
					{
						success: false,
						failed: true,
						state: 'FAILED',
						status: 'FAILED',
						orderId: order.id,
						error: mismatchMessage,
						message: mismatchMessage
					},
					{ status: 400 }
				);
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
					paymentStatus: 'paid',
					paymentChannel: verificationResult.channel,
					paidAt: verificationResult.paidAt || new Date()
				}
			});

			try {
				await sendOrderConfirmationEmailIfNeeded(order.id);
			} catch (emailError) {
				console.error('Failed to send payment verification confirmation email:', emailError);
			}

			if (paidTransition.count > 0) {
				invalidateAdminStatsCache();
				logOrderStatusTransition({
					orderId: order.id,
					source: 'verify',
					fromStatus: order.status,
					toStatus: 'paid',
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: 'paid'
				});
			}

			if (paidTransition.count === 0) {
				const latestOrder = await prisma.order.findUnique({
					where: { id: order.id },
					select: { status: true }
				});

				if (latestOrder?.status === 'completed') {
					return json({
						success: true,
						state: 'SUCCESS',
						status: 'COMPLETED',
						orderId: order.id,
						message: 'Order already processed'
					});
				}

				if (latestOrder?.status === 'paid') {
					const recovered = await recoverPaidOrderIfNeeded(order.id);
					if (recovered.fulfilled) {
						return json({
							success: true,
							state: 'SUCCESS',
							status: 'COMPLETED',
							orderId: order.id,
							message: 'Order already processed'
						});
					}

					return json({
						success: true,
						state: 'SUCCESS',
						warning: recovered.warning,
						orderId: order.id,
						status: 'PAID'
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
				const nextStatus = getFailureOrderStatus(failureKind);
				await prisma.order.update({
					where: { id: failedOrder.id },
					data: {
						status: nextStatus,
						paymentStatus: failureKind === 'cancelled' ? 'cancelled' : 'failed'
					}
				});
				invalidateAdminStatsCache();

				logOrderStatusTransition({
					orderId: failedOrder.id,
					source: 'verify',
					fromStatus: failedOrder.status,
					toStatus: nextStatus,
					fromPaymentStatus: failedOrder.paymentStatus,
					toPaymentStatus: failureKind === 'cancelled' ? 'cancelled' : 'failed'
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
				const nextPaymentStatus = getPendingPaymentPhase(resolvedStatus);
				await prisma.order.update({
					where: { id: orderById.id },
					data: {
						status: 'pending_payment',
						paymentStatus: nextPaymentStatus
					}
				});
				invalidateAdminStatsCache();

				logOrderStatusTransition({
					orderId: orderById.id,
					source: 'verify',
					fromStatus: orderById.status,
					toStatus: 'pending_payment',
					fromPaymentStatus: orderById.paymentStatus,
					toPaymentStatus: nextPaymentStatus
				});
			}

			return buildPendingResponse(
				'Waiting for payment confirmation from Monnify.',
				resolvedStatus || 'PENDING'
			);
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
