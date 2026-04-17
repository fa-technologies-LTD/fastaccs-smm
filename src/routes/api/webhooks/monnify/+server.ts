import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyWebhookSignature, verifyPayment } from '$lib/services/payment';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';

type FailureKind = 'cancelled' | 'failed';

const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED']);
const FAILED_STATUSES = new Set(['FAILED', 'REJECTED', 'REJECTED_PAYMENT']);
const SUCCESS_STATUSES = new Set(['PAID', 'OVERPAID']);

function pickString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeStatus(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toUpperCase();
}

function getFailureKind(status: string): FailureKind | null {
	if (!status) return null;
	if (CANCELLED_STATUSES.has(status)) return 'cancelled';
	if (FAILED_STATUSES.has(status)) return 'failed';
	return null;
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
}) {
	const paidTransition = await prisma.order.updateMany({
		where: {
			id: params.orderId,
			status: { notIn: ['paid', 'completed'] }
		},
		data: {
			status: 'paid',
			paymentReference: params.paymentReference || undefined,
			paymentStatus: 'success',
			paymentChannel: params.channel,
			paidAt: params.paidAt || new Date()
		}
	});

	if (paidTransition.count === 0) {
		const existingOrder = await prisma.order.findUnique({
			where: { id: params.orderId },
			select: { status: true }
		});

		if (existingOrder?.status === 'paid' || existingOrder?.status === 'completed') {
			console.info('[payments.webhook] already_processed', {
				orderId: params.orderId,
				status: existingOrder.status
			});
			return;
		}
	}

	console.info('[payments.webhook] marked_paid', {
		orderId: params.orderId,
		paymentReference: params.paymentReference,
		status: params.statusLabel
	});

	const allocationResult = await allocateAccountsForOrder(params.orderId);
	if (!allocationResult.success) {
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

	await prisma.order.update({
		where: { id: order.id },
		data: {
			status: 'cancelled',
			paymentStatus: params.failureKind === 'cancelled' ? 'cancelled' : 'failed'
		}
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
		const eventPaymentStatus = normalizeStatus(eventData?.paymentStatus);

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
			const gatewayStatus = normalizeStatus(verificationResult.status);

			console.info('[payments.webhook] successful_transaction_verify_result', {
				referenceForVerification,
				success: verificationResult.success,
				status: gatewayStatus || null,
				paymentReference: verificationResult.paymentReference || null
			});

			if (!verificationResult.success && !SUCCESS_STATUSES.has(gatewayStatus)) {
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
				statusLabel: gatewayStatus || verificationResult.status || null
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
				const gatewayStatus = normalizeStatus(verificationResult.status);

				if (verificationResult.success || SUCCESS_STATUSES.has(gatewayStatus)) {
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
							statusLabel: gatewayStatus || verificationResult.status || null
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
				// `REJECTED_PAYMENT` is terminal even when status field is absent.
				resolvedFailureKind = eventType === 'REJECTED_PAYMENT' ? 'failed' : 'cancelled';
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

		console.log('Monnify webhook: unhandled event type', eventType);
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
