import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { verifyPayment } from '$lib/services/payment';
import { allocateAccountsForOrder } from '$lib/services/fulfillment';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
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
import { recordPromotionRedemption } from '$lib/services/promotions';
import { isAutoDeliveryPausedSetting } from '$lib/services/admin-settings';

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

function isMissingPromotionColumnError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	const candidate = error as {
		code?: unknown;
		message?: unknown;
		meta?: { column_name?: unknown; column?: unknown };
	};

	const code = typeof candidate.code === 'string' ? candidate.code : '';
	if (code !== 'P2022') return false;

	const message = typeof candidate.message === 'string' ? candidate.message : '';
	const metaColumn =
		typeof candidate.meta?.column_name === 'string'
			? candidate.meta.column_name
			: typeof candidate.meta?.column === 'string'
				? candidate.meta.column
				: '';

	return (
		message.includes('orders.promotion_id') ||
		metaColumn.includes('orders.promotion_id') ||
		metaColumn.includes('promotion_id')
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
	let didMutate = false;
	const autoDeliveryPaused = await isAutoDeliveryPausedSetting().catch(() => false);

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
			await recordPromotionRedemption(order.id).catch((error) => {
				console.warn('[payments.reconcile] failed to record promo redemption for paid order:', error);
			});

			try {
				await sendOrderConfirmationEmailIfNeeded(order.id);
			} catch (emailError) {
				console.error('[payments.reconcile] failed to send order confirmation email:', emailError);
			}

			if (!autoDeliveryPaused) {
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
			} else {
				summary.paid += 1;
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
				didMutate = true;

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
					didMutate = true;

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
				didMutate = true;

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

				await recordPromotionRedemption(order.id).catch((error) => {
					console.warn('[payments.reconcile] failed to record promo redemption after paid transition:', error);
				});
			}
			summary.paid += 1;

			if (!dryRun && !autoDeliveryPaused) {
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
				didMutate = true;

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
				didMutate = true;

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
			didMutate = true;

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

	if (!dryRun && didMutate) {
		invalidateAdminStatsCache();
	}

	return summary;
}

export function startPaymentReconciliationScheduler(): void {
	const schedulerEnabled = (env.PAYMENT_RECONCILE_SCHEDULER || '').toLowerCase() === 'true';
	if (!schedulerEnabled) return;
	if (!hasMonnifyConfig()) return;

	const globalKey = '__fastaccsPaymentReconcileIntervalStarted__';
	const pausedKey = '__fastaccsPaymentReconcilePaused__';
	const globalScope = globalThis as unknown as Record<string, boolean>;
	if (globalScope[globalKey]) {
		return;
	}

	globalScope[globalKey] = true;
	const intervalMs = Math.max(Number(env.PAYMENT_RECONCILE_INTERVAL_MS || 300000), 60000);

	setInterval(() => {
		if (globalScope[pausedKey]) {
			return;
		}

		void reconcilePendingPayments({ limit: 50 }).catch((error) => {
			if (isMissingPromotionColumnError(error)) {
				globalScope[pausedKey] = true;
				console.error(
					'[payments.reconcile] paused: database schema is missing orders.promotion_id; run prisma migrations'
				);
				void sendCriticalAdminAlert({
					title: 'Payment reconciliation paused (migration required)',
					message:
						'Database schema is behind code: missing orders.promotion_id. Run `npx prisma migrate deploy && npx prisma generate` on production and redeploy.',
					source: 'payments.reconcile.scheduler',
					dedupeKey: 'payments-reconcile-schema-mismatch',
					cooldownMs: 24 * 60 * 60 * 1000
				}).catch((notifyError) => {
					console.error(
						'Failed to notify admin about reconciliation schema mismatch:',
						notifyError
					);
				});
				return;
			}

			console.error('[payments.reconcile] scheduler_error', error);
			void sendCriticalAdminAlert({
				title: 'Payment reconciliation scheduler error',
				message:
					error instanceof Error ? error.message : 'Unknown reconciliation scheduler failure.',
				source: 'payments.reconcile.scheduler',
				dedupeKey: 'payments-reconcile-scheduler-error'
			}).catch((notifyError) => {
				console.error('Failed to notify admin about reconciliation scheduler error:', notifyError);
			});
		});
	}, intervalMs);

	console.info('[payments.reconcile] scheduler_started', {
		intervalMs
	});
}
