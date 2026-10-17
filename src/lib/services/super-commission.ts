import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { calculateSuperOrderCommission } from '$lib/services/affiliate-policy';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import {
	computeVestsAt,
	detectAffiliateIdentityRiskSignals,
	getRewardVestingDays
} from '$lib/services/affiliate-vesting';
import { SC_AFFILIATE_ADJUSTMENT } from '$lib/services/store-credit';
import {
	SUPER_COMMISSION_REFERENCE_PREFIX,
	SUPER_COST_MISSING_HOLD,
	SUPER_ORDER_COMMISSION_KIND,
	SUPER_ORDER_COMMISSION_PERCENT,
	getSuperSwitchoverAt,
	goodsCostFromOrderMetadata
} from '$lib/services/super-affiliate-terms';

/**
 * Super profit commission, one ledger row per order (`super:commission:order:<id>`).
 * - Only after the switchover, only on account orders, only after the buyer activated on an
 *   earlier order (the activating order earns the ₦700 activation only).
 * - Rows carry `metadata.orderId`, so the existing refund paths void/reverse them.
 * - No per-order notification is sent and no cost or profit is stored for display.
 */

export interface SuperCommissionOrder {
	id: string;
	userId: string | null;
	affiliateUserId: string | null;
	affiliateCode: string | null;
	orderType: string | null;
	totalAmount: unknown;
	storeCreditApplied: unknown;
	refundedAmount: unknown;
	paidAt: Date | null;
	createdAt: Date;
	analyticsMetadata: unknown;
}

export function superCommissionReference(orderId: string): string {
	return `${SUPER_COMMISSION_REFERENCE_PREFIX}${orderId}`;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export async function recordSuperOrderCommission(
	order: SuperCommissionOrder
): Promise<{ recorded: 'none' | 'pending' | 'held'; amount: number }> {
	const superUserId = order.affiliateUserId;
	const buyerUserId = order.userId;
	if (!superUserId || !buyerUserId || order.orderType !== 'account') {
		return { recorded: 'none', amount: 0 };
	}
	const switchoverAt = await getSuperSwitchoverAt();
	const paidAt = order.paidAt ?? order.createdAt;
	if (!switchoverAt || paidAt < switchoverAt) return { recorded: 'none', amount: 0 };

	// Activated on an EARLIER order: the order that triggers activation earns the ₦700 only.
	const activation = await prisma.walletTransaction.findUnique({
		where: { reference: `super:activation:${superUserId}:${buyerUserId}` },
		select: { status: true, metadata: true }
	});
	if (!activation || !['pending', 'available'].includes(activation.status)) {
		return { recorded: 'none', amount: 0 };
	}
	if (record(activation.metadata).activatedByOrderId === order.id) {
		return { recorded: 'none', amount: 0 };
	}

	const reference = superCommissionReference(order.id);
	const existing = await prisma.walletTransaction.findUnique({
		where: { reference },
		select: { id: true }
	});
	if (existing) return { recorded: 'none', amount: 0 };

	const goodsCostNgn = goodsCostFromOrderMetadata(order.analyticsMetadata);
	const commission = calculateSuperOrderCommission({
		totalAmount: order.totalAmount,
		storeCreditApplied: order.storeCreditApplied,
		refundedAmount: order.refundedAmount,
		goodsCostNgn,
		percent: SUPER_ORDER_COMMISSION_PERCENT
	});
	if (!commission.held && commission.amount <= 0) return { recorded: 'none', amount: 0 };

	const identityRiskSignals = await detectAffiliateIdentityRiskSignals(superUserId, buyerUserId);
	const vestsAt = computeVestsAt(await getRewardVestingDays(), paidAt);
	const metadata: Prisma.InputJsonObject = {
		kind: SUPER_ORDER_COMMISSION_KIND,
		orderId: order.id,
		buyerUserId,
		affiliateCode: order.affiliateCode,
		percent: SUPER_ORDER_COMMISSION_PERCENT,
		termsVersion: 'super-v2',
		vestsAt: vestsAt.toISOString(),
		...(commission.held ? { holdReason: SUPER_COST_MISSING_HOLD } : {}),
		...(identityRiskSignals.length > 0 ? { suspectedSelfReferral: true, identityRiskSignals } : {})
	};

	try {
		await prisma.$transaction(async (tx) => {
			const wallet = await tx.wallet.upsert({
				where: { userId: superUserId },
				update: { balance: { increment: 0 } },
				create: { userId: superUserId, balance: 0, currency: 'NGN' }
			});
			const balance = Number(wallet.balance || 0);
			await tx.walletTransaction.create({
				data: {
					walletId: wallet.id,
					userId: superUserId,
					type: 'affiliate_credit',
					amount: commission.amount,
					balanceBefore: balance,
					balanceAfter: balance,
					description: 'Order earnings',
					reference,
					// A missing goods cost is held for an admin; it never vests on its own.
					status: commission.held ? 'under_review' : 'pending',
					metadata
				}
			});
		});
	} catch (error) {
		if ((error as { code?: string })?.code === 'P2002') return { recorded: 'none', amount: 0 };
		throw error;
	}

	await recordAffiliateEvent({
		type: commission.held ? 'super_commission_held' : 'super_commission_pending',
		dedupeKey: reference,
		affiliateUserId: superUserId,
		referredUserId: buyerUserId,
		orderId: order.id,
		source: 'order_settlement',
		metadata: {
			amount: commission.amount,
			...(commission.held ? { holdReason: SUPER_COST_MISSING_HOLD } : {})
		}
	}).catch((error) => console.error('Failed to record Super commission event:', error));

	return { recorded: commission.held ? 'held' : 'pending', amount: commission.amount };
}

const ORDER_SELECT = {
	id: true,
	userId: true,
	affiliateUserId: true,
	affiliateCode: true,
	orderType: true,
	totalAmount: true,
	storeCreditApplied: true,
	refundedAmount: true,
	paidAt: true,
	createdAt: true,
	analyticsMetadata: true
} as const;

/** Partial refund: shrink a pending commission, or record an append-only adjustment once vested. */
export async function reconcileSuperCommissionForOrder(orderId: string): Promise<void> {
	const [order, reward] = await Promise.all([
		prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT }),
		prisma.walletTransaction.findUnique({
			where: { reference: superCommissionReference(orderId) },
			select: { id: true, walletId: true, userId: true }
		})
	]);
	if (!order || !reward) return;
	const target = calculateSuperOrderCommission({
		totalAmount: order.totalAmount,
		storeCreditApplied: order.storeCreditApplied,
		refundedAmount: order.refundedAmount,
		goodsCostNgn: goodsCostFromOrderMetadata(order.analyticsMetadata),
		percent: SUPER_ORDER_COMMISSION_PERCENT
	});
	await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${reward.walletId}::uuid FOR UPDATE`;
		const live = await tx.walletTransaction.findUnique({
			where: { id: reward.id },
			select: { amount: true, status: true, metadata: true }
		});
		// Held rows are recalculated when an admin resolves them.
		if (!live || !['pending', 'available'].includes(live.status) || target.held) return;
		const current = Math.max(0, Number(live.amount || 0));
		const metadata = record(live.metadata);
		if (live.status === 'pending') {
			if (target.amount === current) return;
			await tx.walletTransaction.update({
				where: { id: reward.id },
				data: {
					amount: target.amount,
					status: target.amount > 0 ? 'pending' : 'reversed',
					metadata: {
						...metadata,
						originalAwardAmount: Number(metadata.originalAwardAmount ?? current),
						orderRefundedAmount: Number(order.refundedAmount || 0),
						adjustedForPartialRefundAt: new Date().toISOString()
					} as Prisma.InputJsonObject
				}
			});
			return;
		}
		const prior = await tx.walletTransaction.findMany({
			where: {
				walletId: reward.walletId,
				type: SC_AFFILIATE_ADJUSTMENT,
				status: 'available',
				metadata: { path: ['orderId'], equals: orderId }
			},
			select: { amount: true }
		});
		const alreadyAdjusted = prior.reduce((sum, row) => sum + Math.max(0, Number(row.amount)), 0);
		const additional = Math.max(0, current - target.amount - alreadyAdjusted);
		if (additional <= 0) return;
		const wallet = await tx.wallet.findUnique({
			where: { id: reward.walletId },
			select: { balance: true }
		});
		if (!wallet) return;
		const balanceBefore = Number(wallet.balance || 0);
		const recovered = Math.min(additional, Math.max(0, balanceBefore));
		if (recovered > 0) {
			await tx.wallet.update({
				where: { id: reward.walletId },
				data: { balance: balanceBefore - recovered }
			});
		}
		await tx.walletTransaction.create({
			data: {
				walletId: reward.walletId,
				userId: reward.userId,
				type: SC_AFFILIATE_ADJUSTMENT,
				amount: additional,
				balanceBefore,
				balanceAfter: balanceBefore - recovered,
				description: 'Order earnings adjusted after a refund',
				reference: `super:commission:adjustment:${orderId}:${Number(order.refundedAmount || 0)}`,
				status: 'available',
				metadata: {
					orderId,
					kind: SUPER_ORDER_COMMISSION_KIND,
					orderRefundedAmount: Number(order.refundedAmount || 0),
					recoveredAdjustmentAmount: recovered,
					unrecoveredAdjustmentAmount: additional - recovered
				}
			}
		});
	});
}

/**
 * Admin review of a commission held because the order had no goods cost: the admin enters the
 * real cost for that order. The commission then waits out the normal hold before it clears.
 */
export async function resolveHeldSuperCommission(params: {
	transactionId: string;
	affiliateUserId: string;
	goodsCostNgn: number;
	actorUserId: string;
}): Promise<{ success: boolean; amount?: number; error?: string }> {
	if (!Number.isFinite(params.goodsCostNgn) || params.goodsCostNgn < 0) {
		return { success: false, error: 'Enter the real goods cost for this order.' };
	}
	const row = await prisma.walletTransaction.findFirst({
		where: {
			id: params.transactionId,
			userId: params.affiliateUserId,
			status: 'under_review',
			reference: { startsWith: SUPER_COMMISSION_REFERENCE_PREFIX }
		},
		select: { id: true, metadata: true }
	});
	const metadata = record(row?.metadata);
	if (!row || metadata.holdReason !== SUPER_COST_MISSING_HOLD || !metadata.orderId) {
		return { success: false, error: 'This held commission was not found.' };
	}
	const order = await prisma.order.findUnique({
		where: { id: String(metadata.orderId) },
		select: ORDER_SELECT
	});
	if (!order) return { success: false, error: 'Order not found.' };
	const commission = calculateSuperOrderCommission({
		totalAmount: order.totalAmount,
		storeCreditApplied: order.storeCreditApplied,
		refundedAmount: order.refundedAmount,
		goodsCostNgn: params.goodsCostNgn,
		percent: Number(metadata.percent ?? SUPER_ORDER_COMMISSION_PERCENT)
	});
	const vestsAt = new Date(
		Math.max(
			Date.now(),
			computeVestsAt(await getRewardVestingDays(), order.paidAt ?? order.createdAt).getTime()
		)
	);
	const { holdReason: _resolved, ...rest } = metadata;
	void _resolved;
	const updated = await prisma.walletTransaction.updateMany({
		where: { id: row.id, status: 'under_review' },
		data: {
			amount: commission.amount,
			status: commission.amount > 0 ? 'pending' : 'reversed',
			metadata: {
				...rest,
				vestsAt: vestsAt.toISOString(),
				costResolvedBy: params.actorUserId,
				costResolvedAt: new Date().toISOString()
			} as Prisma.InputJsonObject
		}
	});
	if (updated.count !== 1)
		return { success: false, error: 'This commission was already reviewed.' };
	return { success: true, amount: commission.amount };
}
