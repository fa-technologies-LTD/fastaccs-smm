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
import {
	notifyManualHandoverOrderPaid,
	notifyBoostingOrderPaid
} from '$lib/services/manual-handover';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import { isManualHandoverOrder, isBoostingOrder } from '$lib/services/order-delivery-mode';
import {
	confirmPhonePaymentAndInitializeRental,
	initPhoneOrder,
	isPhoneOrder
} from '$lib/services/phone-fulfillment';
import { releaseOrderReservations } from '$lib/services/order-reservations';
import {
	restoreStoreCreditRedemptionForLatePayment,
	reverseStoreCreditRedemption
} from '$lib/services/store-credit';
import { maybeGrantSpendMilestones } from '$lib/services/spend-milestones';
import { recordPromotionRedemption } from '$lib/services/promotions';
import {
	isGa4MeasurementProtocolConfigured,
	sendGa4MeasurementProtocolEvents
} from '$lib/server/ga4-measurement-protocol';
import {
	CONFIRMED_PAYMENT_STATUSES,
	isOrderPaymentConfirmed
} from '$lib/helpers/buyer-order-visibility';

export type PaymentSettlementSource =
	| 'verify'
	| 'webhook'
	| 'reconcile'
	| 'admin_release'
	| 'store_credit';

export interface PaymentSettlementResult {
	success: boolean;
	orderId: string;
	status: 'PAID' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING';
	manualHandover?: boolean;
	boosting?: boolean;
	phone?: boolean;
	warning?: string | null;
	error?: string;
}

function hasTerminalRefundMarker(order: {
	status: string;
	paymentStatus: string;
	deliveryStatus: string;
}): boolean {
	return [order.status, order.paymentStatus, order.deliveryStatus].some(
		(value) => String(value || '').toLowerCase() === 'refunded'
	);
}

function isLateStoreCreditReservationError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.startsWith('STORE_CREDIT_LATE_PAYMENT_') ||
			error.message === 'STORE_CREDIT_REFERENCE_CONFLICT')
	);
}

async function holdLateSplitPaymentForReview(
	order: {
		id: string;
		orderNumber: string;
		paymentReference: string | null;
		paymentChannel: string | null;
		paidAt: Date | null;
	},
	input: {
		source: PaymentSettlementSource;
		paymentReference?: string | null;
		channel?: string | null;
		paidAt?: Date | null;
	},
	error: unknown
): Promise<PaymentSettlementResult> {
	const reason = error instanceof Error ? error.message : 'STORE_CREDIT_LATE_PAYMENT_UNKNOWN';
	await prisma.order.updateMany({
		where: {
			id: order.id,
			status: { notIn: ['paid', 'processing', 'completed', 'refunded'] },
			paymentStatus: { notIn: [...CONFIRMED_PAYMENT_STATUSES, 'refunded'] }
		},
		data: {
			status: 'payment_review',
			paymentStatus: 'under_review',
			paymentReference: input.paymentReference || order.paymentReference,
			paymentChannel: input.channel || order.paymentChannel,
			paidAt: input.paidAt || order.paidAt || new Date(),
			paymentCheckoutUrl: null,
			cancellationReason: `late_payment_store_credit_review:${reason}`
		}
	});
	void sendCriticalAdminAlert({
		title: 'Late split payment held for review',
		message: `${order.orderNumber} has verified gateway cash, but its restored store credit could not be safely re-reserved (${reason}). No fulfilment was released.`,
		source: `payments.${input.source}`,
		dedupeKey: `late-split-payment-review:${order.id}`
	}).catch((alertError) => {
		console.error(
			`[payments.${input.source}] failed to send split-payment review alert:`,
			alertError
		);
	});
	return {
		success: true,
		orderId: order.id,
		status: 'PENDING',
		warning: 'Payment confirmed. Your order is being reviewed before delivery.'
	};
}

async function holdLateTerminalPaymentForReview(
	order: {
		id: string;
		orderNumber: string;
		paymentReference: string | null;
		paymentChannel: string | null;
		paidAt: Date | null;
	},
	input: {
		source: PaymentSettlementSource;
		paymentReference?: string | null;
		channel?: string | null;
		paidAt?: Date | null;
	}
): Promise<PaymentSettlementResult> {
	await prisma.order.updateMany({
		where: {
			id: order.id,
			status: { in: ['failed', 'cancelled', 'canceled'] },
			paymentStatus: { not: 'refunded' },
			deliveryStatus: { not: 'refunded' }
		},
		data: {
			status: 'payment_review',
			paymentStatus: 'under_review',
			paymentReference: input.paymentReference || order.paymentReference,
			paymentChannel: input.channel || order.paymentChannel,
			paidAt: input.paidAt || order.paidAt || new Date(),
			paymentCheckoutUrl: null,
			cancellationReason: 'late_verified_payment_review'
		}
	});
	void sendCriticalAdminAlert({
		title: 'Late payment held for review',
		message: `${order.orderNumber} received a verified payment after the order had already closed. No fulfilment or additional credit was released.`,
		source: `payments.${input.source}`,
		dedupeKey: `late-terminal-payment-review:${order.id}`
	}).catch((alertError) => {
		console.error(
			`[payments.${input.source}] failed to send late-payment review alert:`,
			alertError
		);
	});
	return {
		success: true,
		orderId: order.id,
		status: 'PENDING',
		warning: 'Payment confirmed. Your order is being reviewed before delivery.'
	};
}

async function holdPaymentReferenceConflictForReview(
	order: {
		id: string;
		orderNumber: string;
		paymentReference: string | null;
	},
	input: { source: PaymentSettlementSource; paymentReference?: string | null }
): Promise<PaymentSettlementResult> {
	await prisma.order.updateMany({
		where: {
			id: order.id,
			status: { notIn: ['paid', 'processing', 'completed', 'refunded'] },
			paymentStatus: { notIn: [...CONFIRMED_PAYMENT_STATUSES, 'refunded'] }
		},
		data: {
			status: 'payment_review',
			paymentStatus: 'under_review',
			paymentCheckoutUrl: null,
			cancellationReason: 'payment_reference_conflict_review'
		}
	});
	void sendCriticalAdminAlert({
		title: 'Payment reference conflict held for review',
		message: `${order.orderNumber} stored ${order.paymentReference || 'no reference'}, but settlement presented ${input.paymentReference || 'no reference'}. No fulfilment or additional credit was released.`,
		source: `payments.${input.source}`,
		dedupeKey: `payment-reference-conflict:${order.id}:${input.paymentReference || 'unknown'}`
	}).catch((alertError) => {
		console.error(`[payments.${input.source}] failed to alert on reference conflict:`, alertError);
	});
	return {
		success: true,
		orderId: order.id,
		status: 'PENDING',
		warning: 'Payment confirmed. Your order is being reviewed before delivery.'
	};
}

function isPaymentAmountValid(orderTotal: number, paidAmount: number): boolean {
	if (!Number.isFinite(orderTotal) || !Number.isFinite(paidAmount)) return false;
	return paidAmount + 0.01 >= orderTotal;
}

/**
 * The amount the payment gateway must actually cover: the order total minus any store
 * credit already applied. (Store credit pays part, the gateway pays the remainder.)
 */
export function computeExpectedGatewayAmount(
	totalAmount: number,
	storeCreditApplied: number
): number {
	return Math.max(0, Number(totalAmount) - Number(storeCreditApplied || 0));
}

/**
 * Is the gateway-verified amount enough to settle this order? Compares the paid amount
 * against total − store credit, so a valid store-credit + card split is never rejected,
 * and a genuine underpayment always is. This is the exported, unit-tested money rule.
 */
export function isGatewayAmountSufficient(
	totalAmount: number,
	storeCreditApplied: number,
	amountPaid: number
): boolean {
	return isPaymentAmountValid(
		computeExpectedGatewayAmount(totalAmount, storeCreditApplied),
		Number(amountPaid || 0)
	);
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
	clearCheckoutKey?: boolean;
	cancellationReason?: string | null;
}): Promise<PaymentSettlementResult> {
	const nextStatus = getFailureOrderStatus(input.failureKind);
	const nextPaymentStatus = input.failureKind === 'cancelled' ? 'cancelled' : 'failed';
	const result = await prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT id FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`;
			const order = await tx.order.findUnique({ where: { id: input.orderId } });
			if (!order) return { kind: 'missing' as const, order: null };

			if (isOrderPaymentConfirmed(order)) {
				return { kind: 'confirmed' as const, order };
			}
			// A failed/late callback may observe an already-refunded order. Never overwrite
			// that terminal money state with "failed" and reopen another refund path.
			if (hasTerminalRefundMarker(order)) {
				if (input.clearCheckoutKey && order.checkoutKey) {
					await tx.order.update({
						where: { id: order.id },
						data: { checkoutKey: null }
					});
				}
				return { kind: 'refunded' as const, order };
			}

			await tx.order.update({
				where: { id: order.id },
				data: {
					status: nextStatus,
					paymentStatus: nextPaymentStatus,
					paymentCheckoutUrl: null,
					...(input.clearCheckoutKey ? { checkoutKey: null } : {}),
					...(input.cancellationReason !== undefined
						? { cancellationReason: input.cancellationReason }
						: {})
				}
			});
			// The order transition and credit restoration are one commit. A concurrent
			// successful callback can no longer revive the order between these operations.
			if (order.userId && Number(order.storeCreditApplied || 0) > 0) {
				await reverseStoreCreditRedemption(tx, {
					userId: order.userId,
					orderId: order.id
				});
			}
			return { kind: 'transitioned' as const, order };
		},
		{ maxWait: 10_000, timeout: 20_000 }
	);

	if (result.kind === 'missing' || !result.order) {
		return {
			success: false,
			orderId: input.orderId,
			status: 'FAILED',
			error: 'Order not found'
		};
	}
	const order = result.order;
	if (result.kind === 'confirmed') {
		return {
			success: true,
			orderId: order.id,
			status: order.status === 'completed' ? 'COMPLETED' : 'PAID'
		};
	}
	if (result.kind === 'refunded') {
		return {
			success: true,
			orderId: order.id,
			status: 'CANCELLED'
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

	// Terminal-refunded guard: once an order has been refunded/cancelled (e.g. a Numbers
	// rent that found no stock and auto-refunded to store credit), a late/retried payment
	// webhook or reconcile pass must NEVER re-settle it back to "paid". This closes the
	// status-resurrection bug. `deliveryStatus === 'refunded'` also catches an order whose
	// status was already wrongly resurrected but whose delivery state proves the refund.
	if (
		order.status === 'refunded' ||
		order.status === 'cancelled' ||
		order.paymentStatus === 'refunded' ||
		order.deliveryStatus === 'refunded'
	) {
		return { success: true, orderId: order.id, status: 'CANCELLED' };
	}

	// Buyer spend-milestone rewards (₦8k promo, ₦70k gift) — idempotent, best-effort.
	// This runs only after the terminal-refund guard so a late reconcile can never reward
	// an order whose money has already been returned.
	await maybeGrantSpendMilestones(order.userId);

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

	if (order.orderType === 'phone' && (await isPhoneOrder(order.id))) {
		// Fast path: confirm payment now, rent the number on the order page (keeps
		// payment verification snappy). Fulfillment failures still auto-refund.
		await initPhoneOrder(order.id);
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
			phone: true,
			warning: 'Payment confirmed. Getting your number…'
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
	if (hasTerminalRefundMarker(order)) {
		return {
			success: true,
			orderId: order.id,
			status: 'CANCELLED',
			warning: 'This order has already been refunded.'
		};
	}
	if (
		input.source !== 'admin_release' &&
		order.paymentReference &&
		input.paymentReference &&
		order.paymentReference !== input.paymentReference
	) {
		return holdPaymentReferenceConflictForReview(order, input);
	}
	if (
		['failed', 'cancelled', 'canceled'].includes(String(order.status || '').toLowerCase()) ||
		['failed', 'cancelled', 'canceled'].includes(String(order.paymentStatus || '').toLowerCase())
	) {
		return holdLateTerminalPaymentForReview(order, input);
	}

	if (isOrderPaymentConfirmed(order)) {
		if (order.orderType === 'phone') {
			// Already-paid is a success boundary. Best-effort creation repairs legacy
			// records, but an infrastructure error must not relabel payment as failed.
			await initPhoneOrder(order.id).catch((error) => {
				console.error(`[payments.${input.source}] paid phone initialization deferred:`, error);
			});
			return {
				success: true,
				orderId: order.id,
				status: order.status === 'completed' ? 'COMPLETED' : 'PAID',
				phone: true,
				warning: order.status === 'completed' ? null : 'Payment confirmed. Getting your number…'
			};
		}
		return recoverPaidOrder(order.id, input.source);
	}

	// Store credit covers part of the total; the gateway only charges the remainder,
	// so validate the paid amount against total − store credit (not the full total).
	const expectedGatewayAmount = computeExpectedGatewayAmount(
		Number(order.totalAmount),
		Number(order.storeCreditApplied || 0)
	);
	if (
		!isGatewayAmountSufficient(
			Number(order.totalAmount),
			Number(order.storeCreditApplied || 0),
			Number(input.amountPaid || 0)
		) ||
		!isPaymentCurrencyValid(order.currency, input.currency)
	) {
		const mismatchMessage = `Order ${order.orderNumber} expected ${order.currency} ${expectedGatewayAmount}, but ${input.source} verified ${input.currency} ${Number(input.amountPaid || 0)}.`;
		console.warn(`[payments.${input.source}] payment_amount_or_currency_mismatch`, {
			orderId: order.id,
			expectedAmount: expectedGatewayAmount,
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

	// Numbers have a stricter commit boundary than ordinary delivery: the payment
	// transition and pending rental must be atomic. Otherwise a process death between
	// those two writes strands paid money with no fulfilment work for the cron to find.
	if (order.orderType === 'phone' && (await isPhoneOrder(order.id))) {
		let initialized: boolean;
		try {
			initialized = await confirmPhonePaymentAndInitializeRental({
				orderId: order.id,
				paymentReference: input.paymentReference || order.paymentReference,
				paymentChannel: input.channel || order.paymentChannel,
				paidAt: input.paidAt || order.paidAt
			});
		} catch (error) {
			if (isLateStoreCreditReservationError(error)) {
				return holdLateSplitPaymentForReview(order, input, error);
			}
			throw error;
		}
		if (!initialized) {
			const latest = await prisma.order.findUnique({ where: { id: order.id } });
			if (latest && isOrderPaymentConfirmed(latest)) {
				return {
					success: true,
					orderId: order.id,
					status: latest.status === 'completed' ? 'COMPLETED' : 'PAID',
					phone: true
				};
			}
			return {
				success: false,
				orderId: order.id,
				status: 'FAILED',
				error: 'This order is already resolved.'
			};
		}

		invalidateAdminStatsCache();
		logOrderStatusTransition({
			orderId: order.id,
			source: input.source,
			fromStatus: order.status,
			toStatus: 'paid',
			fromPaymentStatus: order.paymentStatus,
			toPaymentStatus: 'paid'
		});
		void sendServerPurchaseVerifiedEvent(order.id, 'PAID');
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			phone: true,
			warning: 'Payment confirmed. Getting your number…'
		};
	}

	let transitionResult:
		| { kind: 'transitioned'; beforeStatus: string; beforePaymentStatus: string }
		| { kind: 'confirmed' }
		| { kind: 'refunded' };
	try {
		transitionResult = await prisma.$transaction(
			async (tx) => {
				await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
				const live = await tx.order.findUnique({ where: { id: order.id } });
				if (!live) throw new Error('ORDER_NOT_FOUND_DURING_SETTLEMENT');
				if (hasTerminalRefundMarker(live)) return { kind: 'refunded' as const };
				if (isOrderPaymentConfirmed(live)) return { kind: 'confirmed' as const };

				if (Number(live.storeCreditApplied || 0) > 0) {
					if (!live.userId) throw new Error('STORE_CREDIT_LATE_PAYMENT_USER_NOT_FOUND');
					await restoreStoreCreditRedemptionForLatePayment(tx, {
						userId: live.userId,
						orderId: live.id,
						expectedAmount: Number(live.storeCreditApplied)
					});
				}

				await tx.order.update({
					where: { id: live.id },
					data: {
						status: live.status === 'completed' ? 'completed' : 'paid',
						paymentStatus: 'paid',
						paymentReference: input.paymentReference || live.paymentReference,
						paymentChannel: input.channel || live.paymentChannel,
						paidAt: input.paidAt || live.paidAt || new Date(),
						paymentCheckoutUrl: null
					}
				});
				return {
					kind: 'transitioned' as const,
					beforeStatus: live.status,
					beforePaymentStatus: live.paymentStatus
				};
			},
			{ maxWait: 10_000, timeout: 20_000 }
		);
	} catch (error) {
		if (isLateStoreCreditReservationError(error)) {
			return holdLateSplitPaymentForReview(order, input, error);
		}
		throw error;
	}

	if (transitionResult.kind === 'refunded') {
		return {
			success: true,
			orderId: order.id,
			status: 'CANCELLED',
			warning: 'This order has already been refunded.'
		};
	}
	if (transitionResult.kind === 'transitioned') {
		invalidateAdminStatsCache();
		logOrderStatusTransition({
			orderId: order.id,
			source: input.source,
			fromStatus: transitionResult.beforeStatus,
			toStatus: 'paid',
			fromPaymentStatus: transitionResult.beforePaymentStatus,
			toPaymentStatus: 'paid'
		});
	}

	return recoverPaidOrder(order.id, input.source);
}
