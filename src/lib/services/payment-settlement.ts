import type { FailureKind } from '$lib/helpers/payment-status';
import { getFailureOrderStatus, getPendingPaymentPhase } from '$lib/helpers/payment-status';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import {
	maybeSendAffiliateUnlockInvite,
	recordAffiliateStoreCreditForOrder
} from '$lib/services/affiliate';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import { isAutoDeliveryPausedSetting } from '$lib/services/admin-settings';
import { sendOrderConfirmationEmailIfNeeded } from '$lib/services/email';
import { notifyManualHandoverOrderPaid, notifyBoostingOrderPaid } from '$lib/services/manual-handover';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import { isManualHandoverOrder, isBoostingOrder } from '$lib/services/order-delivery-mode';
import { releaseOrderReservations } from '$lib/services/order-reservations';
import { recordPromotionRedemption } from '$lib/services/promotions';
import {
	isGa4MeasurementProtocolConfigured,
	sendGa4MeasurementProtocolEvents
} from '$lib/server/ga4-measurement-protocol';
import {
	CONFIRMED_PAYMENT_STATUSES,
	isOrderPaymentConfirmed
} from '$lib/helpers/buyer-order-visibility';

export type PaymentSettlementSource = 'verify' | 'webhook' | 'reconcile' | 'admin_release';

export interface PaymentSettlementResult {
	success: boolean;
	orderId: string;
	status: 'PAID' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING';
	manualHandover?: boolean;
	boosting?: boolean;
	warning?: string | null;
	error?: string;
}

function isPaymentAmountValid(orderTotal: number, paidAmount: number): boolean {
	if (!Number.isFinite(orderTotal) || !Number.isFinite(paidAmount)) return false;
	return paidAmount + 0.01 >= orderTotal;
}

function isPaymentCurrencyValid(
	orderCurrency: string | null | undefined,
	paidCurrency: string
): boolean {
	const expectedCurrency = String(orderCurrency || 'NGN').toUpperCase();
	return expectedCurrency === String(paidCurrency || 'NGN').toUpperCase();
}

function readAnalyticsMetadata(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function normalizeGa4ClientId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return /^\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

async function sendServerPurchaseVerifiedEvent(orderId: string, status: 'PAID' | 'COMPLETED') {
	if (!isGa4MeasurementProtocolConfigured()) return;

	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: { orderItems: { orderBy: { createdAt: 'asc' } } }
	});
	if (!order) return;

	const metadata = readAnalyticsMetadata(order.analyticsMetadata);
	const clientId = normalizeGa4ClientId(metadata.ga4ClientId);
	if (!clientId || typeof metadata.ga4ServerPurchaseVerifiedSentAt === 'string') return;

	const result = await sendGa4MeasurementProtocolEvents({
		clientId,
		userId: order.userId,
		events: [
			{
				name: 'purchase_verified_server',
				params: {
					transaction_id: order.id,
					order_number: order.orderNumber,
					order_status: status,
					payment_status: order.paymentStatus,
					delivery_method: order.deliveryMethod,
					delivery_status: order.deliveryStatus,
					currency: order.currency,
					value: Number(order.totalAmount),
					item_count: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
					affiliation: order.affiliateCode ? 'affiliate_referral' : 'FastAccs SMM',
					coupon: order.promotionCode || undefined,
					items: order.orderItems.map((item, index) => ({
						item_id: item.categoryId,
						item_name: item.productName,
						item_category: 'SMM accounts',
						item_variant: 'server_verified',
						price: Number(item.unitPrice),
						quantity: item.quantity,
						index
					}))
				}
			}
		]
	});

	if (!result.success) {
		console.warn('[ga4.measurement_protocol] purchase event skipped:', {
			orderId,
			error: result.error || null
		});
		return;
	}

	await prisma.order.update({
		where: { id: order.id },
		data: {
			analyticsMetadata: toJsonObject({
				...metadata,
				ga4ServerPurchaseVerifiedSentAt: new Date().toISOString()
			})
		}
	});
}

export async function settleFailedPayment(input: {
	orderId: string;
	failureKind: FailureKind;
	source: PaymentSettlementSource;
}): Promise<PaymentSettlementResult> {
	const order = await prisma.order.findUnique({ where: { id: input.orderId } });
	if (!order) {
		return {
			success: false,
			orderId: input.orderId,
			status: 'FAILED',
			error: 'Order not found'
		};
	}

	if (isOrderPaymentConfirmed(order)) {
		return {
			success: true,
			orderId: order.id,
			status: order.status === 'completed' ? 'COMPLETED' : 'PAID'
		};
	}

	const nextStatus = getFailureOrderStatus(input.failureKind);
	const nextPaymentStatus = input.failureKind === 'cancelled' ? 'cancelled' : 'failed';
	const transitioned = await prisma.order.updateMany({
		where: {
			id: order.id,
			NOT: {
				status: { in: ['paid', 'processing', 'completed'] },
				paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
			}
		},
		data: {
			status: nextStatus,
			paymentStatus: nextPaymentStatus,
			paymentCheckoutUrl: null
		}
	});
	if (transitioned.count === 0) {
		const latest = await prisma.order.findUnique({
			where: { id: order.id },
			select: { status: true, paymentStatus: true }
		});
		return {
			success: Boolean(latest && isOrderPaymentConfirmed(latest)),
			orderId: order.id,
			status:
				latest?.status === 'completed'
					? 'COMPLETED'
					: latest?.status === 'paid'
						? 'PAID'
						: input.failureKind === 'cancelled'
							? 'CANCELLED'
							: 'FAILED'
		};
	}

	await releaseOrderReservations(order.id);
	invalidateAdminStatsCache();

	logOrderStatusTransition({
		orderId: order.id,
		source: input.source,
		fromStatus: order.status,
		toStatus: nextStatus,
		fromPaymentStatus: order.paymentStatus,
		toPaymentStatus: nextPaymentStatus
	});

	return {
		success: false,
		orderId: order.id,
		status: input.failureKind === 'cancelled' ? 'CANCELLED' : 'FAILED'
	};
}

export async function markPaymentPending(input: {
	orderId: string;
	gatewayStatus: string;
	source: PaymentSettlementSource;
}): Promise<void> {
	const order = await prisma.order.findUnique({ where: { id: input.orderId } });
	if (!order || isOrderPaymentConfirmed(order)) {
		return;
	}

	const nextPaymentStatus = getPendingPaymentPhase(input.gatewayStatus);
	const transitioned = await prisma.order.updateMany({
		where: {
			id: order.id,
			status: { in: ['pending', 'pending_payment'] },
			paymentStatus: { notIn: [...CONFIRMED_PAYMENT_STATUSES] }
		},
		data: { status: 'pending_payment', paymentStatus: nextPaymentStatus }
	});
	if (transitioned.count === 0) return;
	invalidateAdminStatsCache();
	logOrderStatusTransition({
		orderId: order.id,
		source: input.source,
		fromStatus: order.status,
		toStatus: 'pending_payment',
		fromPaymentStatus: order.paymentStatus,
		toPaymentStatus: nextPaymentStatus
	});
}

export async function recoverPaidOrder(
	orderId: string,
	source: PaymentSettlementSource
): Promise<PaymentSettlementResult> {
	const order = await prisma.order.findUnique({ where: { id: orderId } });
	if (!order) {
		return { success: false, orderId, status: 'FAILED', error: 'Order not found' };
	}

	if (!isOrderPaymentConfirmed(order)) {
		return {
			success: false,
			orderId: order.id,
			status: 'PENDING',
			error: 'Payment has not been confirmed.'
		};
	}

	if (order.status === 'completed') {
		void sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED');
		return { success: true, orderId: order.id, status: 'COMPLETED' };
	}

	await recordPromotionRedemption(order.id).catch((error) => {
		console.warn(`[payments.${source}] failed to record promotion redemption:`, error);
	});
	await sendOrderConfirmationEmailIfNeeded(order.id).catch((error) => {
		console.error(`[payments.${source}] failed to send order confirmation:`, error);
	});

	if (await isBoostingOrder(order.id)) {
		await prisma.order.update({
			where: { id: order.id },
			data: {
				status: 'paid',
				paymentStatus: 'paid',
				deliveryStatus: 'processing'
			}
		});
		await notifyBoostingOrderPaid(order.id, `payments.${source}.boosting`);
		void sendServerPurchaseVerifiedEvent(order.id, 'PAID');
		invalidateAdminStatsCache();
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			boosting: true,
			warning: 'Payment confirmed. Your boost is now being processed.'
		};
	}

	if (await isManualHandoverOrder(order.id)) {
		await prisma.order.update({
			where: { id: order.id },
			data: {
				status: 'paid',
				paymentStatus: 'paid',
				deliveryStatus: 'processing',
				deliveryMethod: 'whatsapp'
			}
		});
		await notifyManualHandoverOrderPaid(order.id, `payments.${source}.manual-handover`);
		await recordAffiliateStoreCreditForOrder(order.id).catch((error) => {
			console.error(`[payments.${source}] failed to record affiliate store credit:`, error);
		});
		if (order.userId) {
			void maybeSendAffiliateUnlockInvite(order.userId);
		}
		void sendServerPurchaseVerifiedEvent(order.id, 'PAID');
		invalidateAdminStatsCache();
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			manualHandover: true,
			warning: 'Payment confirmed. Manual handover is in progress on WhatsApp.'
		};
	}

	if (await isAutoDeliveryPausedSetting().catch(() => false)) {
		void sendServerPurchaseVerifiedEvent(order.id, 'PAID');
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			warning: 'Payment successful. Auto-delivery is currently paused by admin.'
		};
	}

	const allocationResult = await allocateAccountsForOrder(order.id);
	if (!allocationResult.success) {
		const latest = await prisma.order.findUnique({
			where: { id: order.id },
			select: { status: true }
		});
		if (latest?.status === 'completed') {
			void sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED');
			return { success: true, orderId: order.id, status: 'COMPLETED' };
		}
		void sendServerPurchaseVerifiedEvent(order.id, 'PAID');
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			warning: 'Payment successful but account allocation is pending.'
		};
	}

	void sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED');
	return { success: true, orderId: order.id, status: 'COMPLETED' };
}

export async function settleSuccessfulPayment(input: {
	orderId: string;
	source: PaymentSettlementSource;
	paymentReference?: string | null;
	channel?: string | null;
	paidAt?: Date | null;
	amountPaid: number;
	currency: string;
}): Promise<PaymentSettlementResult> {
	const order = await prisma.order.findUnique({ where: { id: input.orderId } });
	if (!order) {
		return { success: false, orderId: input.orderId, status: 'FAILED', error: 'Order not found' };
	}

	if (isOrderPaymentConfirmed(order)) {
		return recoverPaidOrder(order.id, input.source);
	}

	if (
		!isPaymentAmountValid(Number(order.totalAmount), Number(input.amountPaid || 0)) ||
		!isPaymentCurrencyValid(order.currency, input.currency)
	) {
		const mismatchMessage = `Order ${order.orderNumber} expected ${order.currency} ${Number(order.totalAmount)}, but ${input.source} verified ${input.currency} ${Number(input.amountPaid || 0)}.`;
		console.warn(`[payments.${input.source}] payment_amount_or_currency_mismatch`, {
			orderId: order.id,
			expectedAmount: Number(order.totalAmount),
			paidAmount: Number(input.amountPaid || 0),
			expectedCurrency: order.currency,
			paidCurrency: input.currency
		});
		void sendCriticalAdminAlert({
			title: 'Payment amount or currency mismatch',
			message: mismatchMessage,
			source: `payments.${input.source}`,
			dedupeKey: `payment-mismatch:${order.id}`
		}).catch((error) => {
			console.error(`[payments.${input.source}] failed to send mismatch alert:`, error);
		});

		const failedResult = await settleFailedPayment({
			orderId: order.id,
			failureKind: 'failed',
			source: input.source
		});
		if (failedResult.success) return failedResult;
		return {
			success: false,
			orderId: order.id,
			status: 'FAILED',
			error: 'Payment amount or currency did not match the order.'
		};
	}

	const transitioned = await prisma.order.updateMany({
		where: {
			id: order.id,
			OR: [{ status: { notIn: ['paid', 'completed'] } }, { paymentStatus: { not: 'paid' } }]
		},
		data: {
			status: order.status === 'completed' ? 'completed' : 'paid',
			paymentStatus: 'paid',
			paymentReference: input.paymentReference || order.paymentReference,
			paymentChannel: input.channel || order.paymentChannel,
			paidAt: input.paidAt || order.paidAt || new Date(),
			paymentCheckoutUrl: null
		}
	});

	if (transitioned.count > 0) {
		invalidateAdminStatsCache();
		logOrderStatusTransition({
			orderId: order.id,
			source: input.source,
			fromStatus: order.status,
			toStatus: 'paid',
			fromPaymentStatus: order.paymentStatus,
			toPaymentStatus: 'paid'
		});
	}

	return recoverPaidOrder(order.id, input.source);
}
