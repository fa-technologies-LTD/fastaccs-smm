import { prisma } from '$lib/prisma';
import { toNetSales } from '$lib/helpers/order-revenue';
import { SC_AFFILIATE_ADJUSTMENT } from '$lib/services/store-credit';

// Affiliate rewards VEST before they become usable: a reward is recorded as `pending`
// (not counted toward the spendable or withdrawable balance) and only flips to
// `available` after the refund window passes AND the order hasn't been refunded. A
// refund inside the window simply voids the pending reward — nothing to claw back.

const REWARD_VESTING_DAYS_KEY = 'config.affiliate.reward_vesting_days';
export const DEFAULT_REWARD_VESTING_DAYS = 14;
// An order in any of these states means its reward must not vest (void it instead).
const REFUNDED_ORDER_STATUSES = new Set(['refunded', 'cancelled', 'failed', 'expired']);

export async function getRewardVestingDays(): Promise<number> {
	// Defensive: a config-read failure must never break reward recording or the emails
	// that depend on it — fall back to the default window.
	try {
		const row = await prisma.microcopy.findFirst({
			where: { key: REWARD_VESTING_DAYS_KEY },
			select: { value: true }
		});
		const n = Number(row?.value);
		return Number.isFinite(n) && n > 0 ? n : DEFAULT_REWARD_VESTING_DAYS;
	} catch {
		return DEFAULT_REWARD_VESTING_DAYS;
	}
}

export function computeVestsAt(days: number, from: Date = new Date()): Date {
	return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Self-referral signal beyond matching user ID: do the affiliate and the referred buyer
 * share a payout bank account? (Signup IP/device isn't stored, so bank is the strongest
 * signal we have.) A match → the reward is flagged and won't auto-vest until admin review.
 */
export async function detectSharedPayoutBank(
	affiliateUserId: string,
	buyerUserId: string
): Promise<boolean> {
	if (!affiliateUserId || !buyerUserId) return false;
	const [a, b] = await Promise.all([
		prisma.affiliatePayoutDetails
			.findFirst({
				where: { userId: affiliateUserId },
				select: { accountNumber: true, bankName: true }
			})
			.catch(() => null),
		prisma.affiliatePayoutDetails
			.findFirst({
				where: { userId: buyerUserId },
				select: { accountNumber: true, bankName: true }
			})
			.catch(() => null)
	]);
	const accA = (a?.accountNumber || '').trim();
	const accB = (b?.accountNumber || '').trim();
	if (!accA || !accB) return false;
	return (
		accA === accB &&
		(a?.bankName || '').trim().toLowerCase() === (b?.bankName || '').trim().toLowerCase()
	);
}

/**
 * Void any still-`pending` (unvested) affiliate rewards tied to an order — called on
 * refund/cancel. Idempotent: only touches rows still `pending`, so repeated
 * refund/webhook events can't double-void or resurrect anything.
 */
export async function voidUnvestedRewardsForOrder(orderId: string): Promise<{ voided: number }> {
	const pending = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_credit',
			status: 'pending',
			OR: [
				{ reference: `affiliate:credit:order:${orderId}` },
				{ metadata: { path: ['orderId'], equals: orderId } },
				{ metadata: { path: ['activatedByOrderId'], equals: orderId } }
			]
		},
		select: { id: true }
	});
	if (pending.length === 0) return { voided: 0 };
	const result = await prisma.walletTransaction.updateMany({
		where: { id: { in: pending.map((p) => p.id) }, status: 'pending' },
		data: { status: 'reversed' }
	});
	return { voided: result.count };
}

/**
 * Backstop for a refund that lands AFTER a regular reward has already vested (rare once
 * vesting is in place): reverse the vested reward and pull it back out of the cashable
 * balance. Idempotent — only touches rows still `available`. (Super rewards use their own
 * `maybeVoidSuperActivationOnRefund` post-vest path.)
 */
export async function reverseVestedRegularRewardForOrder(
	orderId: string
): Promise<{ reversed: number }> {
	const rows = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_credit',
			status: 'available',
			reference: `affiliate:credit:order:${orderId}`
		},
		select: { id: true, amount: true, walletId: true, userId: true }
	});
	let reversed = 0;
	for (const row of rows) {
		const changed = await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${row.walletId}::uuid FOR UPDATE`;
			const liveReward = await tx.walletTransaction.findUnique({
				where: { id: row.id },
				select: { status: true, amount: true }
			});
			if (liveReward?.status !== 'available') return false;
			const priorAdjustments = await tx.walletTransaction.findMany({
				where: {
					walletId: row.walletId,
					type: SC_AFFILIATE_ADJUSTMENT,
					status: 'available',
					metadata: { path: ['orderId'], equals: orderId }
				},
				select: { id: true, amount: true }
			});
			const alreadyAdjusted = priorAdjustments.reduce(
				(sum, adjustment) => sum + Math.max(0, Number(adjustment.amount || 0)),
				0
			);
			const w = await tx.wallet.findUnique({
				where: { id: row.walletId },
				select: { balance: true }
			});
			if (!w) return false;
			const before = Number(w?.balance || 0);
			await tx.wallet.update({
				where: { id: row.walletId },
				data: {
					balance: Math.max(
						0,
						before - Math.max(0, Number(liveReward.amount || 0) - alreadyAdjusted)
					)
				}
			});
			await tx.walletTransaction.update({ where: { id: row.id }, data: { status: 'reversed' } });
			if (priorAdjustments.length > 0) {
				await tx.walletTransaction.updateMany({
					where: { id: { in: priorAdjustments.map((adjustment) => adjustment.id) } },
					data: { status: 'reversed' }
				});
			}
			return true;
		});
		if (changed) reversed += 1;
	}
	return { reversed };
}

/**
 * Promote matured pending rewards to `available` (adding them to the wallet's cashable
 * balance), skipping any whose order has since been refunded/cancelled (those are voided
 * instead as a backstop). Run on a schedule.
 */
export async function vestMaturedAffiliateRewards(limit = 500): Promise<{
	vested: number;
	voided: number;
	skipped: number;
}> {
	const nowIso = new Date().toISOString();
	const pending = await prisma.walletTransaction.findMany({
		where: { type: 'affiliate_credit', status: 'pending' },
		select: { id: true, amount: true, walletId: true, metadata: true },
		take: limit
	});

	let vested = 0;
	let voided = 0;
	let skipped = 0;

	for (const row of pending) {
		const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
			string,
			unknown
		>;
		const vestsAt = typeof meta.vestsAt === 'string' ? meta.vestsAt : null;
		if (!vestsAt || vestsAt > nowIso) {
			skipped += 1; // not matured yet
			continue;
		}
		if (meta.suspectedSelfReferral === true) {
			skipped += 1; // flagged for admin review — never auto-vests
			continue;
		}

		const orderId =
			(typeof meta.orderId === 'string' && meta.orderId) ||
			(typeof meta.activatedByOrderId === 'string' && meta.activatedByOrderId) ||
			null;

		if (orderId) {
			const order = await prisma.order.findUnique({
				where: { id: orderId },
				select: { status: true, paymentStatus: true, deliveryStatus: true }
			});
			const refunded =
				order &&
				(REFUNDED_ORDER_STATUSES.has(order.status) ||
					REFUNDED_ORDER_STATUSES.has(order.paymentStatus) ||
					REFUNDED_ORDER_STATUSES.has(order.deliveryStatus));
			if (refunded) {
				const result = await prisma.walletTransaction.updateMany({
					where: { id: row.id, status: 'pending' },
					data: { status: 'reversed' }
				});
				voided += result.count;
				continue;
			}
		}

		// Matured + order still good → vest: flip to available and credit the balance now.
		const changed = await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${row.walletId}::uuid FOR UPDATE`;
			const liveReward = await tx.walletTransaction.findUnique({
				where: { id: row.id },
				select: { status: true, amount: true }
			});
			if (liveReward?.status !== 'pending') return false;
			const w = await tx.wallet.findUnique({
				where: { id: row.walletId },
				select: { balance: true }
			});
			if (!w) return false;
			const before = Number(w?.balance || 0);
			await tx.wallet.update({
				where: { id: row.walletId },
				data: { balance: before + Number(liveReward.amount || 0) }
			});
			await tx.walletTransaction.update({
				where: { id: row.id },
				data: {
					status: 'available',
					metadata: { ...meta, lifecycleStatus: 'available', vestedAt: nowIso }
				}
			});
			return true;
		});
		if (changed) vested += 1;
		else skipped += 1;
	}

	return { vested, voided, skipped };
}

/** Reduce a regular affiliate reward to the order value FastAccs actually retained.
 * Pending rewards are resized before vesting; already-vested rewards are reduced under
 * the wallet lock. Idempotent across repeated refund requests. */
export async function reconcileRegularRewardForOrder(orderId: string): Promise<void> {
	const [order, reward] = await Promise.all([
		prisma.order.findUnique({
			where: { id: orderId },
			select: { totalAmount: true, refundedAmount: true }
		}),
		prisma.walletTransaction.findUnique({
			where: { reference: `affiliate:credit:order:${orderId}` },
			select: { id: true, walletId: true, userId: true }
		})
	]);
	if (!order || !reward) return;

	await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${reward.walletId}::uuid FOR UPDATE`;
		const live = await tx.walletTransaction.findUnique({
			where: { id: reward.id },
			select: { amount: true, status: true, metadata: true }
		});
		if (!live || !['pending', 'available'].includes(live.status)) return;
		const metadata =
			live.metadata && typeof live.metadata === 'object' && !Array.isArray(live.metadata)
				? (live.metadata as Record<string, unknown>)
				: {};
		const originalAward = Math.max(0, Number(metadata.originalAwardAmount ?? live.amount ?? 0));
		const total = Math.max(0, Number(order.totalAmount || 0));
		const retained = toNetSales(order.totalAmount, order.refundedAmount);
		const target = total > 0 ? Math.max(0, Math.round(originalAward * (retained / total))) : 0;
		const current = Math.max(0, Number(live.amount || 0));
		if (live.status === 'pending') {
			if (
				target === current &&
				Number(metadata.orderRefundedAmount || 0) === Number(order.refundedAmount || 0)
			)
				return;
			await tx.walletTransaction.update({
				where: { id: reward.id },
				data: {
					amount: target,
					status: target > 0 ? 'pending' : 'reversed',
					metadata: {
						...metadata,
						originalAwardAmount: originalAward,
						orderRefundedAmount: Number(order.refundedAmount || 0),
						adjustedForPartialRefundAt: new Date().toISOString()
					}
				}
			});
			return;
		}

		const priorAdjustments = await tx.walletTransaction.findMany({
			where: {
				walletId: reward.walletId,
				type: SC_AFFILIATE_ADJUSTMENT,
				status: 'available',
				metadata: { path: ['orderId'], equals: orderId }
			},
			select: { amount: true }
		});
		const alreadyAdjusted = priorAdjustments.reduce(
			(sum, adjustment) => sum + Math.max(0, Number(adjustment.amount || 0)),
			0
		);
		const desiredAdjustment = Math.max(0, current - target);
		const additionalAdjustment = Math.max(0, desiredAdjustment - alreadyAdjusted);
		if (additionalAdjustment <= 0) return;

		if (live.status === 'available') {
			const wallet = await tx.wallet.findUnique({
				where: { id: reward.walletId },
				select: { balance: true }
			});
			if (wallet) {
				const balanceBefore = Number(wallet.balance || 0);
				// The affiliate may already have spent some of the vested reward. Never invent a
				// ledger debit larger than the wallet change we can actually recover.
				const recoveredAdjustment = Math.min(additionalAdjustment, Math.max(0, balanceBefore));
				if (recoveredAdjustment <= 0) return;
				const balanceAfter = balanceBefore - recoveredAdjustment;
				await tx.wallet.update({
					where: { id: reward.walletId },
					data: { balance: balanceAfter }
				});
				await tx.walletTransaction.create({
					data: {
						walletId: reward.walletId,
						userId: reward.userId,
						type: SC_AFFILIATE_ADJUSTMENT,
						amount: recoveredAdjustment,
						balanceBefore,
						balanceAfter,
						description: 'Affiliate commission adjusted after a partial order refund',
						reference: `affiliate:adjustment:order:${orderId}:${Number(order.refundedAmount || 0)}`,
						status: 'available',
						metadata: {
							orderId,
							...(typeof metadata.buyerUserId === 'string'
								? { buyerUserId: metadata.buyerUserId }
								: {}),
							orderRefundedAmount: Number(order.refundedAmount || 0),
							originalAwardAmount: originalAward,
							targetAwardAmount: target,
							unrecoveredAdjustmentAmount: additionalAdjustment - recoveredAdjustment
						}
					}
				});
			}
		}
	});
}
