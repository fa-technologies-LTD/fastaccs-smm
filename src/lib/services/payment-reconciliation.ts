import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { verifyPayment } from '$lib/services/payment';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';
import {
	getFailureKind,
	isPendingPaymentStatus,
	isSuccessPaymentStatus,
	normalizePaymentStatus
} from '$lib/helpers/payment-status';
import {
	getPaymentReservationExpiresAt,
	getPendingPaymentExpireMinutes,
	getPendingPaymentExpiryThreshold,
	isPendingPaymentExpired
} from '$lib/helpers/payment-expiry.server';
import {
	markPaymentPending,
	recoverPaidOrder,
	settleFailedPayment,
	settleSuccessfulPayment
} from '$lib/services/payment-settlement';
import { releaseExpiredOrderReservations } from '$lib/services/order-reservations';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { createPaymentTraceId, logPaymentEvent } from '$lib/server/payment-observability';

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

interface ReconcileBacklogSummary extends ReconcileSummary {
	rounds: number;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_STALE_MINUTES = 10;
const DEFAULT_EXPIRE_MINUTES = getPendingPaymentExpireMinutes();

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

export async function reconcilePendingPayments(
	options: ReconcileOptions = {}
): Promise<ReconcileSummary> {
	const traceId = createPaymentTraceId();
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
	logPaymentEvent('info', 'reconcile.started', {
		traceId,
		source: dryRun ? 'dry_run' : 'scheduled_or_manual',
		status: 'STARTED'
	});
	if (!hasMonnifyConfig()) {
		summary.skipped = limit;
		logPaymentEvent('warn', 'reconcile.skipped', {
			traceId,
			source: 'missing_monnify_config',
			status: 'SKIPPED'
		});
		return summary;
	}

	const now = Date.now();
	const staleThreshold = now - staleMinutes * 60 * 1000;
	const expiryThreshold = getPendingPaymentExpiryThreshold(expireMinutes);
	if (!dryRun) {
		await releaseExpiredOrderReservations();
	}

	const candidates = await prisma.order.findMany({
		where: {
			paymentMethod: 'monnify',
			OR: [
				{ status: 'pending_payment' },
				{ status: 'pending' },
				{ status: 'paid' },
				{ paymentStatus: 'paid', status: { not: 'completed' } }
			]
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

		if (isOrderPaymentConfirmed(order)) {
			if (dryRun) {
				summary.paid += 1;
			} else {
				const result = await recoverPaidOrder(order.id, 'reconcile');
				if (result.status === 'COMPLETED') summary.completed += 1;
				else summary.paid += 1;
			}
			continue;
		}

		if (!order.paymentReference) {
			const shouldExpire = order.paymentExpiresAt
				? order.paymentExpiresAt.getTime() <= now
				: order.createdAt.getTime() <= expiryThreshold;
			if (!shouldExpire) {
				summary.keptPending += 1;
				continue;
			}

			if (!dryRun)
				await settleFailedPayment({
					orderId: order.id,
					failureKind: 'cancelled',
					source: 'reconcile'
				});
			summary.cancelled += 1;
			continue;
		}

		const verificationResult = await verifyPayment(order.paymentReference);
		const gatewayStatus = normalizePaymentStatus(verificationResult.status);
		logPaymentEvent('info', 'reconcile.verification_result', {
			traceId,
			orderId: order.id,
			paymentReference: verificationResult.paymentReference || order.paymentReference,
			transactionReference: verificationResult.transactionReference,
			status: gatewayStatus || null,
			success: verificationResult.success,
			amount: verificationResult.amount,
			amountPaid: verificationResult.amountPaid,
			currency: verificationResult.currency
		});

		if (verificationResult.success || isSuccessPaymentStatus(gatewayStatus)) {
			if (dryRun) {
				summary.paid += 1;
			} else {
				const result = await settleSuccessfulPayment({
					orderId: order.id,
					source: 'reconcile',
					paymentReference: verificationResult.paymentReference || order.paymentReference,
					channel: verificationResult.channel,
					paidAt: verificationResult.paidAt,
					amountPaid: Number(verificationResult.amountPaid || verificationResult.amount || 0),
					currency: verificationResult.currency
				});
				logPaymentEvent(result.success ? 'info' : 'error', 'reconcile.settlement_result', {
					traceId,
					orderId: order.id,
					paymentReference: verificationResult.paymentReference || order.paymentReference,
					transactionReference: verificationResult.transactionReference,
					status: result.status,
					success: result.success,
					amountPaid: Number(verificationResult.amountPaid || verificationResult.amount || 0),
					currency: verificationResult.currency,
					errorMessage: result.error || result.warning || null
				});
				if (!result.success || result.status === 'FAILED') summary.failed += 1;
				else if (result.status === 'COMPLETED') summary.completed += 1;
				else summary.paid += 1;
			}
			continue;
		}

		const failureKind = getFailureKind(gatewayStatus);
		if (failureKind) {
			if (!dryRun)
				await settleFailedPayment({ orderId: order.id, failureKind, source: 'reconcile' });

			if (failureKind === 'cancelled') {
				summary.cancelled += 1;
			} else {
				summary.failed += 1;
			}
			continue;
		}

		const isOldPending = order.paymentExpiresAt
			? getPaymentReservationExpiresAt(order.paymentExpiresAt).getTime() <= now
			: isPendingPaymentExpired(order.createdAt, gatewayStatus, expireMinutes);
		if (isOldPending) {
			if (!dryRun)
				await settleFailedPayment({
					orderId: order.id,
					failureKind: 'cancelled',
					source: 'reconcile'
				});
			summary.cancelled += 1;
			continue;
		}

		if (!dryRun && isPendingPaymentStatus(gatewayStatus)) {
			await markPaymentPending({ orderId: order.id, gatewayStatus, source: 'reconcile' });
		}

		summary.keptPending += 1;
	}

	logPaymentEvent('info', 'reconcile.completed', {
		traceId,
		source: dryRun ? 'dry_run' : 'scheduled_or_manual',
		status: 'COMPLETED',
		success: true
	});
	return summary;
}

export async function reconcilePendingPaymentBacklog(
	options: ReconcileOptions & { maxRounds?: number } = {}
): Promise<ReconcileBacklogSummary> {
	const batchSize = Math.min(Math.max(Number(options.limit || 50), 1), 500);
	const maxRounds = Math.min(Math.max(Number(options.maxRounds || 3), 1), 10);
	const summary: ReconcileBacklogSummary = {
		checked: 0,
		paid: 0,
		completed: 0,
		failed: 0,
		cancelled: 0,
		keptPending: 0,
		skipped: 0,
		dryRun: options.dryRun === true,
		rounds: 0
	};

	for (let round = 0; round < maxRounds; round += 1) {
		const result = await reconcilePendingPayments({
			...options,
			limit: batchSize
		});
		summary.rounds += 1;
		summary.checked += result.checked;
		summary.paid += result.paid;
		summary.completed += result.completed;
		summary.failed += result.failed;
		summary.cancelled += result.cancelled;
		summary.keptPending += result.keptPending;
		summary.skipped += result.skipped;

		if (result.checked < batchSize || result.checked === 0 || result.skipped === result.checked) {
			break;
		}
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
