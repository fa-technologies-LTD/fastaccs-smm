import type { PrismaClient } from '@prisma/client';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import {
	supplierSubmissionMayExist,
	UNRESOLVED_BOOST_SUBMISSION_OUTCOMES
} from './transition-safety';
import type { BoostProviderId } from './types';

/** Final local dispatch gate, serialized with refunds; no network call inside the transaction. */
export async function reserveBoostSubmission(
	database: PrismaClient,
	input: {
		orderId: string;
		fulfillmentId: string;
		routeId: string;
		provider: BoostProviderId;
		serviceId: string;
		leaseToken: string;
		attemptCount: number;
		requestFingerprint: string;
		supplierCostUsd: number;
		balanceSafetyUsd: number;
	}
): Promise<'reserved' | 'order_hold' | 'state_changed' | 'balance_unavailable'> {
	if (
		!Number.isFinite(input.supplierCostUsd) ||
		input.supplierCostUsd <= 0 ||
		!Number.isFinite(input.balanceSafetyUsd) ||
		input.balanceSafetyUsd < 0
	)
		return 'balance_unavailable';
	if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 0) return 'state_changed';
	return database.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`;
		const order = await tx.order.findUnique({
			where: { id: input.orderId },
			select: { status: true, paymentStatus: true, deliveryStatus: true }
		});
		if (
			!order ||
			!isOrderPaymentConfirmed(order) ||
			!['paid', 'processing'].includes(order.status) ||
			order.deliveryStatus === 'refunded'
		)
			return 'order_hold';
		const current = await tx.boostFulfillment.findUnique({
			where: { id: input.fulfillmentId },
			select: {
				status: true,
				supplierOrderId: true,
				submittedAt: true,
				leaseToken: true,
				leaseExpiresAt: true,
				attemptCount: true,
				attemptCap: true,
				orderItem: { select: { orderId: true } },
				attempts: {
					where: { type: 'submission', outcome: { in: [...UNRESOLVED_BOOST_SUBMISSION_OUTCOMES] } },
					select: { type: true, outcome: true },
					orderBy: { createdAt: 'desc' },
					take: 1
				}
			}
		});
		if (
			!current ||
			current.status !== 'queued' ||
			current.leaseToken !== input.leaseToken ||
			!current.leaseExpiresAt ||
			current.leaseExpiresAt <= new Date() ||
			current.attemptCount !== input.attemptCount ||
			!Number.isSafeInteger(current.attemptCap) ||
			current.attemptCap < 1 ||
			current.attemptCount >= current.attemptCap ||
			current.orderItem.orderId !== input.orderId ||
			supplierSubmissionMayExist({ ...current, leaseToken: null, leaseExpiresAt: null })
		)
			return 'state_changed';
		const reserved = await tx.boostProviderState.updateMany({
			where: {
				provider: input.provider,
				projectedBalance: { gte: input.supplierCostUsd + input.balanceSafetyUsd }
			},
			data: { projectedBalance: { decrement: input.supplierCostUsd } }
		});
		if (!reserved.count) return 'balance_unavailable';
		await tx.boostAttempt.create({
			data: {
				fulfillmentId: input.fulfillmentId,
				routeId: input.routeId,
				type: 'submission',
				outcome: 'started',
				requestFingerprint: input.requestFingerprint,
				supplierCostUsd: input.supplierCostUsd,
				safeSummary: { provider: input.provider, serviceId: input.serviceId }
			}
		});
		return 'reserved';
	});
}
