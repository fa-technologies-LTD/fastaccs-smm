import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { initializeTransaction, verifyTransaction } from '$lib/services/monnify';
import { isCheckoutEnabledSetting } from '$lib/services/admin-settings';
import {
	getPaymentReservationExpiresAt,
	getPendingPaymentExpiresAt
} from '$lib/helpers/payment-expiry.server';
import {
	getFailureKind,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import { settleFailedPayment, settleSuccessfulPayment } from '$lib/services/payment-settlement';
import { extendOrderReservations } from '$lib/services/order-reservations';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import {
	CHECKOUT_DISABLED_CODE,
	CHECKOUT_DISABLED_MESSAGE,
	isNewCheckoutInitializationDisabled
} from '$lib/helpers/checkout-control.server';
import { createPaymentTraceId, logPaymentEvent } from '$lib/server/payment-observability';
import {
	getMonnifyInitializationErrorMessage,
	getMonnifyInitializationIssue
} from '$lib/helpers/monnify-initialization.server';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const traceId = createPaymentTraceId(request);

	try {
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const checkoutEnabled = await isCheckoutEnabledSetting().catch(() => true);
		if (!checkoutEnabled && locals.user.userType !== 'ADMIN') {
			return json({ success: false, error: 'Checkout is temporarily disabled.' }, { status: 503 });
		}

		if (!locals.user.emailVerified) {
			return json(
				{
					success: false,
					error: 'Email verification required before checkout.',
					code: 'EMAIL_NOT_VERIFIED'
				},
				{ status: 403 }
			);
		}

		const { orderId } = await request.json();

		if (!orderId) {
			return json({ success: false, error: 'Order ID is required' }, { status: 400 });
		}

		const order = await prisma.order.findUnique({ where: { id: orderId } });

		if (!order) {
			return json({ success: false, error: 'Order not found' }, { status: 404 });
		}

		if (order.userId !== locals.user.id) {
			return json({ success: false, error: 'Forbidden' }, { status: 403 });
		}

		if (isOrderPaymentConfirmed(order)) {
			return json({ success: false, error: 'Order has already been paid' }, { status: 400 });
		}

		if (!['pending', 'pending_payment'].includes(order.status)) {
			return json(
				{ success: false, error: 'This order can no longer accept payment.' },
				{ status: 409 }
			);
		}

		if (
			order.paymentCheckoutUrl &&
			order.paymentExpiresAt &&
			order.paymentExpiresAt.getTime() > Date.now() &&
			['pending', 'pending_payment'].includes(order.status)
		) {
			logPaymentEvent('info', 'initialize.resumed', {
				traceId,
				orderId,
				userId: locals.user.id,
				paymentReference: order.paymentReference,
				resumed: true,
				amount: Number(order.totalAmount),
				currency: order.currency
			});
			return json({
				success: true,
				resumed: true,
				checkoutUrl: order.paymentCheckoutUrl,
				orderId,
				paymentReference: order.paymentReference
			});
		}

		if (
			order.paymentExpiresAt &&
			order.paymentExpiresAt.getTime() <= Date.now() &&
			['pending', 'pending_payment'].includes(order.status)
		) {
			if (order.paymentReference) {
				const verification = await verifyTransaction(order.paymentReference);
				const gatewayStatus = normalizePaymentStatus(verification.paymentStatus);

				if (verification.success || isSuccessPaymentStatus(gatewayStatus)) {
					await settleSuccessfulPayment({
						orderId,
						source: 'verify',
						paymentReference: verification.paymentReference || order.paymentReference,
						channel: verification.paymentMethod,
						paidAt: verification.paidOn,
						amountPaid: Number(verification.amountPaid || verification.amount || 0),
						currency: verification.currency
					});
					return json({ success: true, alreadyPaid: true, orderId });
				}

				const failureKind = getFailureKind(gatewayStatus);
				if (!failureKind && order.paymentCheckoutUrl) {
					const reservationExpiresAt = getPaymentReservationExpiresAt(order.paymentExpiresAt);
					if (reservationExpiresAt.getTime() > Date.now()) {
						// Monnify still has this transaction open and our reservation
						// buffer hasn't lapsed — let the customer keep paying on the
						// same checkout link instead of cancelling and releasing stock.
						const refreshedExpiresAt = getPendingPaymentExpiresAt();
						await prisma.order.update({
							where: { id: orderId },
							data: { paymentExpiresAt: refreshedExpiresAt }
						});
						await extendOrderReservations(
							orderId,
							getPaymentReservationExpiresAt(refreshedExpiresAt)
						);
						return json({
							success: true,
							resumed: true,
							checkoutUrl: order.paymentCheckoutUrl,
							orderId,
							paymentReference: order.paymentReference
						});
					}
				}

				await settleFailedPayment({
					orderId,
					failureKind: failureKind || 'cancelled',
					source: 'verify'
				});
			} else {
				await settleFailedPayment({ orderId, failureKind: 'cancelled', source: 'verify' });
			}

			return json(
				{ success: false, error: 'Payment window expired. Please start a fresh checkout.' },
				{ status: 409 }
			);
		}

		if (isNewCheckoutInitializationDisabled()) {
			logPaymentEvent('warn', 'initialize.blocked', {
				traceId,
				orderId,
				userId: locals.user.id,
				source: 'emergency_switch',
				amount: Number(order.totalAmount),
				currency: order.currency
			});
			return json(
				{
					success: false,
					error: CHECKOUT_DISABLED_MESSAGE,
					code: CHECKOUT_DISABLED_CODE,
					traceId
				},
				{ status: 503 }
			);
		}

		const amount = Number(order.totalAmount);
		const currency = String(order.currency || '')
			.trim()
			.toUpperCase();
		const initializationIssue = getMonnifyInitializationIssue({ amount, currency });
		if (initializationIssue) {
			logPaymentEvent('warn', 'initialize.rejected', {
				traceId,
				orderId,
				userId: locals.user.id,
				amount,
				currency,
				errorCode: initializationIssue
			});
			return json(
				{
					success: false,
					error: getMonnifyInitializationErrorMessage(initializationIssue),
					traceId
				},
				{ status: 409 }
			);
		}

		const shortOrderId = orderId.substring(0, 8);
		const paymentReference = `ORD_${shortOrderId}_${Date.now()}`;
		const paymentExpiresAt = getPendingPaymentExpiresAt();
		const redirectUrl = `${url.origin}/checkout/verify?orderId=${encodeURIComponent(orderId)}`;

		logPaymentEvent('info', 'initialize.started', {
			traceId,
			orderId,
			userId: locals.user.id,
			paymentReference,
			amount,
			currency
		});

		const result = await initializeTransaction({
			amount,
			currency,
			customerName: locals.user.fullName || locals.user.email || 'Customer',
			customerEmail: locals.user.email || '',
			paymentReference,
			paymentDescription: `Payment for order ${shortOrderId}`,
			redirectUrl,
			metaData: { orderId, userId: locals.user.id },
			traceId,
			orderId
		});

		if (!result.success || !result.checkoutUrl) {
			logPaymentEvent('error', 'initialize.failed', {
				traceId,
				orderId,
				userId: locals.user.id,
				paymentReference,
				amount,
				currency,
				errorCode: result.errorCode,
				errorMessage: result.error || 'Failed to initialize payment'
			});
			return json(
				{
					success: false,
					error: result.error || 'Failed to initialize payment',
					traceId
				},
				{ status: 500 }
			);
		}

		await prisma.order.update({
			where: { id: orderId },
			data: {
				paymentReference,
				paymentCheckoutUrl: result.checkoutUrl,
				paymentExpiresAt,
				status: 'pending_payment',
				paymentStatus: 'pending'
			}
		});
		await extendOrderReservations(orderId, getPaymentReservationExpiresAt(paymentExpiresAt));

		logPaymentEvent('info', 'initialize.pending_payment', {
			traceId,
			orderId,
			userId: locals.user.id,
			paymentReference,
			transactionReference: result.transactionReference,
			amount,
			currency,
			success: true
		});

		return json({
			success: true,
			checkoutUrl: result.checkoutUrl,
			orderId,
			paymentReference,
			traceId
		});
	} catch (error) {
		logPaymentEvent('error', 'initialize.exception', {
			traceId,
			userId: locals.user?.id,
			errorMessage: error instanceof Error ? error.message : 'Failed to initialize payment'
		});
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to initialize payment',
				traceId
			},
			{ status: 500 }
		);
	}
};
