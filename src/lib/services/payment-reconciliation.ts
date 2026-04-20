import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { verifyPayment } from '$lib/services/payment';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import {
	getFailureKind,
	getFailureOrderStatus,
	getPendingPaymentPhase,
	isPendingPaymentStatus,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import { sendOrderConfirmationEmailIfNeeded } from '$lib/services/email';

interface ReconcileOptions {
	limit?: number;
	staleMinutes?: number;
	expireMinutes?: number;
	dryRun?: boolean;
}

interface ReconcileSummary {
	checked: number;
	paid: number;
	completed: number;
	failed: number;
	cancelled: number;
	keptPending: number;
	skipped: number;
	dryRun: boolean;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_EXPIRE_MINUTES = 120;

function hasMonnifyConfig(): boolean {
	return Boolean(env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY && env.MONNIFY_BASE_URL);
}

function isPaymentAmountValid(orderTotal: number, paidAmount: number): boolean {
	if (!Number.isFinite(orderTotal) || !Number.isFinite(paidAmount)) return false;
	return paidAmount + 0.01 >= orderTotal;
}

function isPaymentCurrencyValid(orderCurrency: string | null | undefined, paidCurrency: string): boolean {
	const expectedCurrency = String(orderCurrency || 'NGN').toUpperCase();
	return expectedCurrency === String(paidCurrency || 'NGN').toUpperCase();
}

export async function reconcilePendingPayments(options: ReconcileOptions = {}): Promise<ReconcileSummary> {
	const dryRun = options.dryRun === true;
	const limit = Math.min(Math.max(Number(options.limit || DEFAULT_LIMIT), 1), 500);
	const staleMinutesInput =
		options.staleMinutes === undefined || options.staleMinutes === null
			? DEFAULT_STALE_MINUTES
			: Number(options.staleMinutes);
	const staleMinutes = Math.max(Number.isFinite(staleMinutesInput) ? staleMinutesInput : 0, 0);

	const expireMinutesInput =
		options.expireMinutes === undefined || options.expireMinutes === null
			? DEFAULT_EXPIRE_MINUTES
			: Number(options.expireMinutes);
	const expireMinutes = Math.max(
		Number.isFinite(expireMinutesInput) ? expireMinutesInput : DEFAULT_EXPIRE_MINUTES,
		Math.max(staleMinutes, 1)
	);

	const summary: ReconcileSummary = {
		checked: 0,
		paid: 0,
		completed: 0,
		failed: 0,
		cancelled: 0,
		keptPending: 0,
		skipped: 0,
		dryRun
	};

	if (!hasMonnifyConfig()) {
		summary.skipped = limit;
		console.warn('[payments.reconcile] skipped: Monnify config missing');
		return summary;
	}

	const now = Date.now();
	const staleThreshold = now - staleMinutes * 60 * 1000;
	const expiryThreshold = now - expireMinutes * 60 * 1000;

	const candidates = await prisma.order.findMany({
		where: {
			paymentMethod: 'monnify',
			OR: [{ status: 'pending_payment' }, { status: 'pending' }, { status: 'paid' }]
		},
		orderBy: { updatedAt: 'asc' },
		take: limit
	});

	for (const order of candidates) {
		summary.checked += 1;

		const orderUpdatedAt = order.updatedAt.getTime();
		if (orderUpdatedAt > staleThreshold) {
			summary.skipped += 1;
			continue;
		}

		if (order.status === 'completed') {
			summary.skipped += 1;
			continue;
		}

		if (order.status === 'paid') {
			try {
				await sendOrderConfirmationEmailIfNeeded(order.id);
			} catch (emailError) {
				console.error('[payments.reconcile] failed to send order confirmation email:', emailError);
			}

			const allocationResult = await allocateAccountsForOrder(order.id);
			if (allocationResult.success) {
				summary.completed += 1;
			} else {
				const latestOrder = await prisma.order.findUnique({
					where: { id: order.id },
					select: { status: true }
				});
				if (latestOrder?.status === 'completed') {
					summary.completed += 1;
				} else {
					summary.paid += 1;
				}
			}
			continue;
		}

		if (!order.paymentReference) {
			const shouldExpire = order.createdAt.getTime() <= expiryThreshold;
			if (!shouldExpire) {
				summary.keptPending += 1;
				continue;
			}

			if (!dryRun) {
				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: 'cancelled',
						paymentStatus: 'cancelled'
					}
				});

				logOrderStatusTransition({
					orderId: order.id,
					source: 'reconcile',
					fromStatus: order.status,
					toStatus: 'cancelled',
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: 'cancelled'
				});
			}
			summary.cancelled += 1;
			continue;
		}

		const verificationResult = await verifyPayment(order.paymentReference);
		const gatewayStatus = normalizePaymentStatus(verificationResult.status);

		if (verificationResult.success || isSuccessPaymentStatus(gatewayStatus)) {
			const paidAmount = Number(verificationResult.amountPaid || verificationResult.amount || 0);
			const amountValid = isPaymentAmountValid(Number(order.totalAmount), paidAmount);
			const currencyValid = isPaymentCurrencyValid(order.currency, verificationResult.currency);

			if (!amountValid || !currencyValid) {
				if (!dryRun) {
					await prisma.order.update({
						where: { id: order.id },
						data: {
							status: 'failed',
							paymentStatus: 'failed'
						}
					});

					logOrderStatusTransition({
						orderId: order.id,
						source: 'reconcile',
						fromStatus: order.status,
						toStatus: 'failed',
						fromPaymentStatus: order.paymentStatus,
						toPaymentStatus: 'failed'
					});
				}
				summary.failed += 1;
				continue;
			}

			if (!dryRun) {
				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: 'paid',
						paymentStatus: 'paid',
						paidAt: verificationResult.paidAt || order.paidAt || new Date(),
						paymentChannel: verificationResult.channel || order.paymentChannel || null
					}
				});

				logOrderStatusTransition({
					orderId: order.id,
					source: 'reconcile',
					fromStatus: order.status,
					toStatus: 'paid',
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: 'paid'
				});

				try {
					await sendOrderConfirmationEmailIfNeeded(order.id);
				} catch (emailError) {
					console.error('[payments.reconcile] failed to send order confirmation email:', emailError);
				}
			}
			summary.paid += 1;

			if (!dryRun) {
				const allocationResult = await allocateAccountsForOrder(order.id);
				if (allocationResult.success) {
					summary.completed += 1;
				}
			}
			continue;
		}

		const failureKind = getFailureKind(gatewayStatus);
		if (failureKind) {
			const nextStatus = getFailureOrderStatus(failureKind);
			if (!dryRun) {
				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: nextStatus,
						paymentStatus: failureKind === 'cancelled' ? 'cancelled' : 'failed'
					}
				});

				logOrderStatusTransition({
					orderId: order.id,
					source: 'reconcile',
					fromStatus: order.status,
					toStatus: nextStatus,
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: failureKind === 'cancelled' ? 'cancelled' : 'failed'
				});
			}

			if (failureKind === 'cancelled') {
				summary.cancelled += 1;
			} else {
				summary.failed += 1;
			}
			continue;
		}

		const isOldPending = order.createdAt.getTime() <= expiryThreshold;
		if (isOldPending) {
			if (!dryRun) {
				await prisma.order.update({
					where: { id: order.id },
					data: {
						status: 'cancelled',
						paymentStatus: 'cancelled'
					}
				});

				logOrderStatusTransition({
					orderId: order.id,
					source: 'reconcile',
					fromStatus: order.status,
					toStatus: 'cancelled',
					fromPaymentStatus: order.paymentStatus,
					toPaymentStatus: 'cancelled'
				});
			}
			summary.cancelled += 1;
			continue;
		}

		if (!dryRun && isPendingPaymentStatus(gatewayStatus)) {
			const pendingPhase = getPendingPaymentPhase(gatewayStatus);
			await prisma.order.update({
				where: { id: order.id },
				data: {
					status: 'pending_payment',
					paymentStatus: pendingPhase
				}
			});

			logOrderStatusTransition({
				orderId: order.id,
				source: 'reconcile',
				fromStatus: order.status,
				toStatus: 'pending_payment',
				fromPaymentStatus: order.paymentStatus,
				toPaymentStatus: pendingPhase
			});
		}

		summary.keptPending += 1;
	}

	return summary;
}

export function startPaymentReconciliationScheduler(): void {
	const schedulerEnabled = (env.PAYMENT_RECONCILE_SCHEDULER || '').toLowerCase() === 'true';
	if (!schedulerEnabled) return;
	if (!hasMonnifyConfig()) return;

	const globalKey = '__fastaccsPaymentReconcileIntervalStarted__';
	const globalScope = globalThis as unknown as Record<string, boolean>;
	if (globalScope[globalKey]) {
		return;
	}

	globalScope[globalKey] = true;
	const intervalMs = Math.max(Number(env.PAYMENT_RECONCILE_INTERVAL_MS || 300000), 60000);

	setInterval(() => {
		void reconcilePendingPayments({ limit: 50 }).catch((error) => {
			console.error('[payments.reconcile] scheduler_error', error);
		});
	}, intervalMs);

	console.info('[payments.reconcile] scheduler_started', {
		intervalMs
	});
}
