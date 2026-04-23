import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import {
	getFailureKind,
	getFailureOrderStatus,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import type { FailureKind } from '$lib/helpers/payment-status';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import { sendOrderConfirmationEmailIfNeeded } from '$lib/services/email';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { recordPromotionRedemption } from '$lib/services/promotions';
import { isAutoDeliveryPausedSetting } from '$lib/services/admin-settings';

function pickString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function isPaymentAmountValid(orderTotal: number, paidAmount: number): boolean {
	if (!Number.isFinite(orderTotal) || !Number.isFinite(paidAmount)) return false;
	return paidAmount + 0.01 >= orderTotal;
}

function isPaymentCurrencyValid(orderCurrency: string | null | undefined, paidCurrency: string): boolean {
	const expectedCurrency = String(orderCurrency || 'NGN').toUpperCase();
	return expectedCurrency === String(paidCurrency || 'NGN').toUpperCase();
}

async function findOrderByPaymentReference(paymentReference: string | null) {
	if (!paymentReference) return null;
	return prisma.order.findFirst({
		where: { paymentReference }
	});
}

async function markOrderPaidAndAllocate(params: {
	orderId: string;
	paymentReference: string | null;
	channel: string | undefined;
	paidAt: Date | undefined;
	statusLabel: string | null;
	amountPaid: number;
	currency: string;
}) {
	const order = await prisma.order.findUnique({
		where: { id: params.orderId },
		select: {
			id: true,
			status: true,
			paymentStatus: true,
			totalAmount: true,
			currency: true
		}
	});

	if (!order) return;

	if (order.status === 'completed') {
		console.info('[payments.webhook] already_processed', {
			orderId: params.orderId,
			status: order.status
		});
		return;
	}

	const amountIsValid = isPaymentAmountValid(Number(order.totalAmount), Number(params.amountPaid || 0));
	const currencyIsValid = isPaymentCurrencyValid(order.currency, params.currency);

	if (!amountIsValid || !currencyIsValid) {
		const previousStatus = order.status;
		const previousPaymentStatus = order.paymentStatus;
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
			source: 'webhook',
			fromStatus: previousStatus,
			toStatus: 'failed',
			fromPaymentStatus: previousPaymentStatus,
			toPaymentStatus: 'failed'
		});

		console.warn('[payments.webhook] amount_or_currency_mismatch', {
			orderId: order.id,
			expectedAmount: Number(order.totalAmount),
			receivedAmount: Number(params.amountPaid || 0),
			expectedCurrency: order.currency,
			receivedCurrency: params.currency
		});
		return;
	}

	const paidTransition = await prisma.order.updateMany({
		where: {
			id: params.orderId,
			status: { notIn: ['paid', 'completed'] }
		},
		data: {
			status: 'paid',
			paymentReference: params.paymentReference || undefined,
			paymentStatus: 'paid',
			paymentChannel: params.channel,
			paidAt: params.paidAt || new Date()
		}
	});

	if (paidTransition.count > 0) {
		invalidateAdminStatsCache();
		logOrderStatusTransition({
			orderId: order.id,
			source: 'webhook',
			fromStatus: order.status,
			toStatus: 'paid',
			fromPaymentStatus: order.paymentStatus,
			toPaymentStatus: 'paid'
		});

		await recordPromotionRedemption(order.id).catch((error) => {
			console.warn('Failed to record promotion redemption from webhook:', error);
		});
	}

	if (paidTransition.count === 0 && order.status === 'paid') {
		await recordPromotionRedemption(order.id).catch((error) => {
			console.warn('Failed to record promotion redemption for already-paid webhook order:', error);
		});

		console.info('[payments.webhook] already_paid_before_webhook', {
			orderId: params.orderId
		});
	}

	console.info('[payments.webhook] marked_paid', {
		orderId: params.orderId,
		paymentReference: params.paymentReference,
		status: params.statusLabel
	});

	try {
		await sendOrderConfirmationEmailIfNeeded(params.orderId);
	} catch (emailError) {
		console.error('Failed to send webhook order confirmation email:', emailError);
	}

	const autoDeliveryPaused = await isAutoDeliveryPausedSetting().catch(() => false);
	if (autoDeliveryPaused) {
		console.info('[payments.webhook] auto_delivery_paused', { orderId: params.orderId });
		return;
	}

	const allocationResult = await allocateAccountsForOrder(params.orderId);
	if (!allocationResult.success) {
		const latestOrder = await prisma.order.findUnique({
			where: { id: params.orderId },
			select: { status: true }
		});

		if (latestOrder?.status === 'completed') {
			return;
		}

		console.warn('[payments.webhook] allocation_pending_manual', {
			orderId: params.orderId,
			error: allocationResult.error || null
		});
		return;
	}

	console.info('[payments.webhook] completed_after_allocation', {
		orderId: params.orderId
	});
}

async function markOrderFailed(params: {
	orderId: string;
	failureKind: FailureKind;
	paymentReference: string | null;
	transactionReference: string | null;
}) {
	const order = await prisma.order.findUnique({
		where: { id: params.orderId }
	});

	if (!order) return;

	if (order.status === 'completed' || order.status === 'paid') {
		console.info('[payments.webhook] ignored_failure_already_paid', {
			orderId: order.id,
			status: order.status
		});
		return;
	}

	const nextStatus = getFailureOrderStatus(params.failureKind);
	await prisma.order.update({
		where: { id: order.id },
		data: {
			status: nextStatus,
			paymentStatus: params.failureKind === 'cancelled' ? 'cancelled' : 'failed'
		}
	});
	invalidateAdminStatsCache();

	logOrderStatusTransition({
		orderId: order.id,
		source: 'webhook',
		fromStatus: order.status,
		toStatus: nextStatus,
		fromPaymentStatus: order.paymentStatus,
		toPaymentStatus: params.failureKind === 'cancelled' ? 'cancelled' : 'failed'
	});

	console.info('[payments.webhook] marked_failure', {
		orderId: order.id,
		failureKind: params.failureKind,
		paymentReference: params.paymentReference,
		transactionReference: params.transactionReference
	});
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const rawBody = await request.text();
		const signature = request.headers.get('monnify-signature');

		if (!signature) {
			console.error('Monnify webhook: missing signature header');
			return json({ success: false, error: 'No signature provided' }, { status: 400 });
		}

		if (!verifyWebhookSignature(signature, rawBody)) {
			console.error('Monnify webhook: invalid signature');
			return json({ success: false, error: 'Invalid signature' }, { status: 401 });
		}

		const body = JSON.parse(rawBody);
		const eventType = pickString(body?.eventType) || '';
		const eventData = body?.eventData || {};
		const transactionReference = pickString(eventData?.transactionReference);
		const paymentReference = pickString(eventData?.paymentReference);
		const eventPaymentStatus = normalizePaymentStatus(eventData?.paymentStatus);

		console.info('[payments.webhook] event_received', {
			eventType,
			transactionReference: transactionReference ?? null,
			paymentReference: paymentReference ?? null,
			paymentStatus: eventPaymentStatus || null
		});

		if (eventType === 'SUCCESSFUL_TRANSACTION') {
			const referenceForVerification = transactionReference || paymentReference;
			if (!referenceForVerification) {
				console.error('Monnify webhook: missing transaction/payment reference for success event');
				return json({ success: false });
			}

			const verificationResult = await verifyPayment(referenceForVerification);
			const gatewayStatus = normalizePaymentStatus(verificationResult.status);

			console.info('[payments.webhook] successful_transaction_verify_result', {
				referenceForVerification,
				success: verificationResult.success,
				status: gatewayStatus || null,
				paymentReference: verificationResult.paymentReference || null
			});

			if (!verificationResult.success && !isSuccessPaymentStatus(gatewayStatus)) {
				console.error(
					'Monnify webhook: unable to confirm success transaction',
					referenceForVerification
				);
				return json({ success: false });
			}

			const metadataOrderId = pickString(verificationResult.metaData?.orderId);
			const orderByReference = !metadataOrderId
				? await findOrderByPaymentReference(
						verificationResult.paymentReference || paymentReference || null
					)
				: null;
			const orderId = metadataOrderId || orderByReference?.id || null;

			if (!orderId) {
				console.error('Monnify webhook: no orderId resolved for success event');
				return json({ success: false });
			}

			await markOrderPaidAndAllocate({
				orderId,
				paymentReference: verificationResult.paymentReference || paymentReference,
				channel: verificationResult.channel,
				paidAt: verificationResult.paidAt,
				statusLabel: gatewayStatus || verificationResult.status || null,
				amountPaid: verificationResult.amountPaid || verificationResult.amount,
				currency: verificationResult.currency
			});

			return json({ success: true });
		}

		if (eventType === 'REJECTED_PAYMENT' || eventType === 'FAILED_TRANSACTION') {
			let resolvedFailureKind = getFailureKind(eventPaymentStatus);
			let resolvedPaymentReference = paymentReference;
			let resolvedOrderId: string | null = null;

			const referenceForVerification = transactionReference || paymentReference;
			if (referenceForVerification) {
				const verificationResult = await verifyPayment(referenceForVerification);
				const gatewayStatus = normalizePaymentStatus(verificationResult.status);

				if (verificationResult.success || isSuccessPaymentStatus(gatewayStatus)) {
					const metadataOrderId = pickString(verificationResult.metaData?.orderId);
					const fallbackOrder = !metadataOrderId
						? await findOrderByPaymentReference(
								verificationResult.paymentReference || paymentReference || null
							)
						: null;
					const successfulOrderId = metadataOrderId || fallbackOrder?.id || null;

					if (successfulOrderId) {
						await markOrderPaidAndAllocate({
							orderId: successfulOrderId,
							paymentReference: verificationResult.paymentReference || paymentReference,
							channel: verificationResult.channel,
							paidAt: verificationResult.paidAt,
							statusLabel: gatewayStatus || verificationResult.status || null,
							amountPaid: verificationResult.amountPaid || verificationResult.amount,
							currency: verificationResult.currency
						});
						return json({ success: true });
					}
				}

				resolvedFailureKind = resolvedFailureKind || getFailureKind(gatewayStatus);
				resolvedPaymentReference =
					verificationResult.paymentReference || resolvedPaymentReference || null;
				resolvedOrderId = pickString(verificationResult.metaData?.orderId);
			}

			if (!resolvedFailureKind) {
				resolvedFailureKind = 'failed';
			}

			if (!resolvedOrderId) {
				const orderByPaymentReference = await findOrderByPaymentReference(resolvedPaymentReference);
				resolvedOrderId = orderByPaymentReference?.id || null;
			}

			if (resolvedOrderId) {
				await markOrderFailed({
					orderId: resolvedOrderId,
					failureKind: resolvedFailureKind,
					paymentReference: resolvedPaymentReference,
					transactionReference
				});
			}

			return json({ success: true });
		}

		const derivedFailureKind = getFailureKind(eventPaymentStatus);
		if (derivedFailureKind) {
			const orderByPaymentReference = await findOrderByPaymentReference(paymentReference);
			if (orderByPaymentReference?.id) {
				await markOrderFailed({
					orderId: orderByPaymentReference.id,
					failureKind: derivedFailureKind,
					paymentReference,
					transactionReference
				});
			}
			return json({ success: true });
		}

		console.log('Monnify webhook: unhandled event type', eventType);
		return json({ success: true });
	} catch (error) {
		console.error('Monnify webhook processing error:', error);
		void sendCriticalAdminAlert({
			title: 'Monnify webhook processing error',
			message: error instanceof Error ? error.message : 'Unknown webhook processing failure.',
			source: 'api.webhooks.monnify',
			dedupeKey: 'monnify-webhook-processing-error'
		}).catch((notifyError) => {
			console.error('Failed to send admin alert for webhook processing error:', notifyError);
		});
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Webhook processing failed'
			},
			{ status: 500 }
		);
	}
};
