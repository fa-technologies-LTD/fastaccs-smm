import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import {
	getFailureKind,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { settleFailedPayment, settleSuccessfulPayment } from '$lib/services/payment-settlement';
import { createPaymentTraceId, logPaymentEvent } from '$lib/server/payment-observability';

function pickString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

async function findOrderByPaymentReference(paymentReference: string | null) {
	if (!paymentReference) return null;
	return prisma.order.findFirst({
		where: { paymentReference }
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const traceId = createPaymentTraceId(request);

	try {
		const rawBody = await request.text();
		const signature = request.headers.get('monnify-signature');

		if (!signature) {
			logPaymentEvent('error', 'webhook.signature_missing', {
				traceId,
				errorCode: 'MISSING_SIGNATURE'
			});
			return json({ success: false, error: 'No signature provided' }, { status: 400 });
		}

		if (!verifyWebhookSignature(signature, rawBody)) {
			logPaymentEvent('error', 'webhook.signature_invalid', {
				traceId,
				errorCode: 'INVALID_SIGNATURE'
			});
			return json({ success: false, error: 'Invalid signature' }, { status: 401 });
		}

		const body = JSON.parse(rawBody);
		const eventType = pickString(body?.eventType) || '';
		const eventData = body?.eventData || {};
		const transactionReference = pickString(eventData?.transactionReference);
		const paymentReference = pickString(eventData?.paymentReference);
		const eventPaymentStatus = normalizePaymentStatus(eventData?.paymentStatus);

		logPaymentEvent('info', 'webhook.event_received', {
			traceId,
			phase: eventType,
			transactionReference: transactionReference ?? null,
			paymentReference: paymentReference ?? null,
			status: eventPaymentStatus || null
		});

		if (eventType === 'SUCCESSFUL_TRANSACTION') {
			const referenceForVerification = transactionReference || paymentReference;
			if (!referenceForVerification) {
				console.error('Monnify webhook: missing transaction/payment reference for success event');
				return json({ success: false });
			}

			const verificationResult = await verifyPayment(referenceForVerification);
			const gatewayStatus = normalizePaymentStatus(verificationResult.status);

			logPaymentEvent('info', 'webhook.verification_result', {
				traceId,
				referenceUsed: referenceForVerification,
				success: verificationResult.success,
				status: gatewayStatus || null,
				paymentReference: verificationResult.paymentReference || null,
				transactionReference: verificationResult.transactionReference || transactionReference,
				amount: verificationResult.amount,
				amountPaid: verificationResult.amountPaid,
				currency: verificationResult.currency
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

			const settlement = await settleSuccessfulPayment({
				orderId,
				source: 'webhook',
				paymentReference: verificationResult.paymentReference || paymentReference,
				channel: verificationResult.channel,
				paidAt: verificationResult.paidAt,
				amountPaid: verificationResult.amountPaid || verificationResult.amount,
				currency: verificationResult.currency
			});

			logPaymentEvent(settlement.success ? 'info' : 'error', 'webhook.settlement_result', {
				traceId,
				orderId,
				paymentReference: verificationResult.paymentReference || paymentReference,
				transactionReference: verificationResult.transactionReference || transactionReference,
				status: settlement.status,
				success: settlement.success,
				amountPaid: verificationResult.amountPaid || verificationResult.amount,
				currency: verificationResult.currency,
				errorMessage: settlement.error || settlement.warning || null
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
						await settleSuccessfulPayment({
							orderId: successfulOrderId,
							source: 'webhook',
							paymentReference: verificationResult.paymentReference || paymentReference,
							channel: verificationResult.channel,
							paidAt: verificationResult.paidAt,
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
				await settleFailedPayment({
					orderId: resolvedOrderId,
					failureKind: resolvedFailureKind,
					source: 'webhook'
				});
			}

			return json({ success: true });
		}

		const derivedFailureKind = getFailureKind(eventPaymentStatus);
		if (derivedFailureKind) {
			const orderByPaymentReference = await findOrderByPaymentReference(paymentReference);
			if (orderByPaymentReference?.id) {
				await settleFailedPayment({
					orderId: orderByPaymentReference.id,
					failureKind: derivedFailureKind,
					source: 'webhook'
				});
			}
			return json({ success: true });
		}

		logPaymentEvent('info', 'webhook.event_unhandled', {
			traceId,
			phase: eventType,
			paymentReference,
			transactionReference,
			status: eventPaymentStatus || null
		});
		return json({ success: true });
	} catch (error) {
		logPaymentEvent('error', 'webhook.exception', {
			traceId,
			errorMessage: error instanceof Error ? error.message : 'Webhook processing failed'
		});
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
				error: error instanceof Error ? error.message : 'Webhook processing failed',
				traceId
			},
			{ status: 500 }
		);
	}
};
