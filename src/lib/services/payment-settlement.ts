import type { FailureKind } from '$lib/helpers/payment-status';
import { getFailureOrderStatus, getPendingPaymentPhase } from '$lib/helpers/payment-status';
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
import { queuePaidBoostFulfillments } from '$lib/server/boosting-providers/fulfillment-worker';
import { usesManagedGa4Ecommerce } from '$lib/server/ga4-order-metadata';
import { allocateFullRefundToItems } from '$lib/helpers/order-revenue';

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

function isPaymentReview(order: { status: string; paymentStatus: string }): boolean {
	return order.status === 'payment_review' || order.paymentStatus === 'under_review';
}

const reviewResult = (orderId: string): PaymentSettlementResult => ({
	success: true,
	orderId,
	status: 'PENDING',
	warning: 'Your payment is being reviewed before delivery.'
});

/** Conditional write closes the stale-read window without reopening terminal orders. */
async function claimPaidRecovery(
	orderId: string,
	manual = false
): Promise<PaymentSettlementResult | null> {
	const result = await prisma.order.updateMany({
		where: {
			id: orderId,
			status: { in: ['paid', 'processing'] },
			paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] },
			deliveryStatus: { not: 'refunded' }
		},
		data: {
			status: 'paid',
			paymentStatus: 'paid',
			deliveryStatus: 'processing',
			...(manual ? { deliveryMethod: 'whatsapp' } : {})
		}
	});
	if (result.count > 0) return null;
	const live = await prisma.order.findUnique({ where: { id: orderId } });
	if (live && hasTerminalRefundMarker(live)) return { success: true, orderId, status: 'CANCELLED' };
	if (live?.status === 'completed' && isOrderPaymentConfirmed(live)) {
		return { success: true, orderId, status: 'COMPLETED' };
	}
	return reviewResult(orderId);
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

export async function sendServerPurchaseVerifiedEvent(
	orderId: string,
	status: 'PAID' | 'COMPLETED'
) {
	if (!isGa4MeasurementProtocolConfigured()) return;

	return prisma.$transaction(
		async (tx) => {
			// PostgreSQL returns void; cast so Prisma can deserialize the lock result.
			await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ga4-purchase:${orderId}`}))::text`;
			const order = await tx.order.findUnique({
				where: { id: orderId },
				include: { orderItems: { orderBy: { createdAt: 'asc' } } }
			});
			if (!order) return 'skipped';
			const metadata = readAnalyticsMetadata(order.analyticsMetadata);
			const managed = usesManagedGa4Ecommerce(metadata);
			const paidAtMs = order.paidAt?.getTime();
			const recentManagedPayment =
				managed &&
				typeof paidAtMs === 'number' &&
				Number.isFinite(paidAtMs) &&
				paidAtMs <= Date.now() &&
				Date.now() - paidAtMs < 72 * 60 * 60_000;
			// A new paid order can be refunded before the first server analytics call.
			// Report the original sale once, then let refund reporting subtract it.
			// Never invent revenue for old/unpaid/ambiguous refunded orders.
			const paidThenRefunded =
				recentManagedPayment &&
				hasTerminalRefundMarker(order) &&
				Number(order.refundedAmount) > 0 &&
				Number(order.refundedAmount) <= Number(order.totalAmount);
			if ((!isOrderPaymentConfirmed(order) || hasTerminalRefundMarker(order)) && !paidThenRefunded)
				return 'skipped';
			if (managed && !recentManagedPayment) return 'skipped';
			const clientId = normalizeGa4ClientId(metadata.ga4ClientId);
			const diagnosticSent = typeof metadata.ga4ServerPurchaseVerifiedSentAt === 'string';
			const canonicalSent = typeof metadata.ga4CanonicalPurchaseSentAt === 'string';
			if (!clientId || (diagnosticSent && (!managed || canonicalSent))) return 'skipped';
			const retryAfter = metadata.ga4ServerPurchaseVerifiedRetryAfter;
			if (typeof retryAfter === 'string' && Date.parse(retryAfter) > Date.now())
				return 'retry_pending';

			const events = [
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
							item_category:
								order.orderType === 'boosting'
									? 'Boosting Services'
									: order.orderType === 'phone'
										? 'Verification Numbers'
										: 'SMM accounts',
							item_variant: `${order.orderType}_server_verified`,
							price: Number(item.unitPrice),
							quantity: item.quantity,
							index
						}))
					}
				}
			];
			if (managed && !canonicalSent) {
				// A promotion reduces sale/item revenue; store credit is tender and does not.
				// Allocate the ORIGINAL paid value, ignoring later refunds (reported separately).
				const allocation = allocateFullRefundToItems(
					order.totalAmount,
					order.orderItems.map((item) => ({
						id: item.id,
						totalPrice: item.totalPrice ?? Number(item.unitPrice) * item.quantity,
						refundedAmount: 0
					}))
				);
				events.push({
					...events[0],
					name: 'purchase',
					params: {
						...events[0].params,
						items: events[0].params.items.map((item, index) => ({
							...item,
							price: allocation.targets[index].refundedAmount / item.quantity
						}))
					}
				});
			}
			if (diagnosticSent) events.shift();
			const result = await sendGa4MeasurementProtocolEvents({
				clientId,
				// New purchases have one reporting authority (server), and retries keep
				// the same client identity/order ID for web-stream purchase deduplication.
				userId: managed ? undefined : order.userId,
				timestampMicros: managed ? String(paidAtMs! * 1000) : undefined,
				events
			});

			if (!result.success) {
				console.warn('[ga4.measurement_protocol] purchase event skipped:', {
					orderId,
					error: result.error || null
				});
				const oldAttempts = Number(metadata.ga4ServerPurchaseVerifiedAttempts);
				const attempts =
					(Number.isSafeInteger(oldAttempts) && oldAttempts >= 0 ? Math.min(oldAttempts, 20) : 0) +
					1;
				const patch = JSON.stringify({
					ga4ServerPurchaseVerifiedAttempts: attempts,
					ga4ServerPurchaseVerifiedRetryAfter: new Date(
						Date.now() + Math.min(360, 5 * 2 ** Math.min(attempts - 1, 7)) * 60_000
					).toISOString()
				});
				// Merge at write time; do not erase metadata updated by another workflow.
				await tx.$executeRaw`UPDATE orders SET analytics_metadata =
					COALESCE(analytics_metadata, '{}'::jsonb) || ${patch}::jsonb WHERE id = ${order.id}::uuid`;
				return 'retry_pending';
			}

			const patch = JSON.stringify({
				ga4ServerPurchaseVerifiedSentAt: new Date().toISOString(),
				ga4ServerPurchaseVerifiedRetryAfter: null,
				...(managed && !canonicalSent
					? { ga4CanonicalPurchaseSentAt: new Date().toISOString() }
					: {})
			});
			await tx.$executeRaw`UPDATE orders SET analytics_metadata =
				COALESCE(analytics_metadata, '{}'::jsonb) || ${patch}::jsonb WHERE id = ${order.id}::uuid`;
			return 'sent';
		},
		{ maxWait: 10_000, timeout: 15_000 }
	);
}

/** The paid order is the durable source: completed orders stay eligible after a restart.
 * Never re-settle payment or fulfilment, and never replay old historical purchases.
 */
export async function drainServerPurchaseAnalytics(limit = 3, deadlineMs = Date.now() + 30_000) {
	const summary = { sent: 0, pending: 0, skipped: 0, failed: 0 };
	if (!isGa4MeasurementProtocolConfigured() || deadlineMs - Date.now() < 25_000) return summary;
	try {
		const now = new Date().toISOString();
		const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
			SELECT id, status FROM orders
			WHERE ((status IN ('paid', 'processing', 'completed')
				AND payment_status IN ('paid', 'success', 'overpaid')
				AND delivery_status <> 'refunded')
				OR (analytics_metadata->>'ga4EcommerceVersion' = '2'
					AND analytics_metadata->>'ga4ConsentGranted' = 'true'
					AND paid_at IS NOT NULL AND refunded_amount > 0
					AND (status = 'refunded' OR payment_status = 'refunded' OR delivery_status = 'refunded')))
			AND COALESCE(paid_at, created_at) >= NOW() - INTERVAL '72 hours'
			AND analytics_metadata->>'ga4ClientId' ~ '^[0-9]+[.][0-9]+$'
			AND (analytics_metadata->>'ga4ServerPurchaseVerifiedSentAt' IS NULL
				OR (analytics_metadata->>'ga4EcommerceVersion' = '2'
					AND analytics_metadata->>'ga4CanonicalPurchaseSentAt' IS NULL))
			AND (analytics_metadata->>'ga4ServerPurchaseVerifiedRetryAfter' IS NULL
				OR analytics_metadata->>'ga4ServerPurchaseVerifiedRetryAfter' <= ${now})
			ORDER BY COALESCE(paid_at, created_at), id
			LIMIT ${Math.min(10, Math.max(1, Math.trunc(Number(limit) || 3)))}`;
		for (const row of rows) {
			if (deadlineMs - Date.now() < 25_000) break;
			try {
				const outcome = await sendServerPurchaseVerifiedEvent(
					row.id,
					row.status === 'completed' ? 'COMPLETED' : 'PAID'
				);
				if (outcome === 'sent') summary.sent++;
				else if (outcome === 'retry_pending') summary.pending++;
				else summary.skipped++;
			} catch {
				summary.failed++;
			}
		}
	} catch {
		summary.failed++;
	}
	return summary;
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
			if (isPaymentReview(order)) return { kind: 'review' as const, order };

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
	if (result.kind === 'review') return reviewResult(order.id);
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
		await sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
		return { success: true, orderId: order.id, status: 'COMPLETED' };
	}

	await recordPromotionRedemption(order.id).catch((error) => {
		console.warn(`[payments.${source}] failed to record promotion redemption:`, error);
	});
	await sendOrderConfirmationEmailIfNeeded(order.id).catch((error) => {
		console.error(`[payments.${source}] failed to send order confirmation:`, error);
	});

	if (await isBoostingOrder(order.id)) {
		const stopped = await claimPaidRecovery(order.id);
		if (stopped) return stopped;
		await queuePaidBoostFulfillments(order.id);
		await notifyBoostingOrderPaid(order.id, `payments.${source}.boosting`);
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
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
		const stopped = await claimPaidRecovery(order.id, true);
		if (stopped) return stopped;
		await notifyManualHandoverOrderPaid(order.id, `payments.${source}.manual-handover`);
		await recordAffiliateStoreCreditForOrder(order.id).catch((error) => {
			console.error(`[payments.${source}] failed to record affiliate store credit:`, error);
		});
		if (order.userId) {
			void maybeSendAffiliateUnlockInvite(order.userId);
		}
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
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
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
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
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
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
			await sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED').catch((error) =>
				console.warn('[ga4.purchase] dispatch failed', {
					orderId: order.id,
					error: error instanceof Error ? error.message : 'unknown'
				})
			);
			return { success: true, orderId: order.id, status: 'COMPLETED' };
		}
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
		return {
			success: true,
			orderId: order.id,
			status: 'PAID',
			warning: 'Payment successful but account allocation is pending.'
		};
	}

	await sendServerPurchaseVerifiedEvent(order.id, 'COMPLETED').catch((error) =>
		console.warn('[ga4.purchase] dispatch failed', {
			orderId: order.id,
			error: error instanceof Error ? error.message : 'unknown'
		})
	);
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
	if (isPaymentReview(order) && input.source !== 'admin_release') return reviewResult(order.id);
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
		await sendServerPurchaseVerifiedEvent(order.id, 'PAID').catch((error) =>
			console.warn('[ga4.purchase] dispatch failed', {
				orderId: order.id,
				error: error instanceof Error ? error.message : 'unknown'
			})
		);
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
		| { kind: 'closed'; order: typeof order }
		| { kind: 'conflict'; order: typeof order }
		| { kind: 'review' }
		| { kind: 'refunded' };
	try {
		transitionResult = await prisma.$transaction(
			async (tx) => {
				await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
				const live = await tx.order.findUnique({ where: { id: order.id } });
				if (!live) throw new Error('ORDER_NOT_FOUND_DURING_SETTLEMENT');
				if (hasTerminalRefundMarker(live)) return { kind: 'refunded' as const };
				if (isOrderPaymentConfirmed(live)) return { kind: 'confirmed' as const };
				if (isPaymentReview(live) && input.source !== 'admin_release')
					return { kind: 'review' as const };
				if (
					['failed', 'cancelled', 'canceled'].includes(live.status) ||
					['failed', 'cancelled', 'canceled'].includes(live.paymentStatus)
				) {
					return { kind: 'closed' as const, order: live };
				}
				if (
					input.source !== 'admin_release' &&
					live.paymentReference &&
					input.paymentReference &&
					live.paymentReference !== input.paymentReference
				) {
					return { kind: 'conflict' as const, order: live };
				}
				if (
					!isGatewayAmountSufficient(
						Number(live.totalAmount),
						Number(live.storeCreditApplied || 0),
						input.amountPaid
					) ||
					!isPaymentCurrencyValid(live.currency, input.currency)
				) {
					throw new Error('PAYMENT_AMOUNT_CHANGED_DURING_SETTLEMENT');
				}

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
	if (transitionResult.kind === 'review') return reviewResult(order.id);
	if (transitionResult.kind === 'conflict')
		return holdPaymentReferenceConflictForReview(transitionResult.order, input);
	if (transitionResult.kind === 'closed')
		return holdLateTerminalPaymentForReview(transitionResult.order, input);
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
