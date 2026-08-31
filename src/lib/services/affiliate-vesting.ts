import { prisma } from '$lib/prisma';
import { toNetSales } from '$lib/helpers/order-revenue';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { SC_AFFILIATE_ADJUSTMENT } from '$lib/services/store-credit';
import { decryptAffiliateBankDetails } from '$lib/services/affiliate-payout-details';
import {
	calculateRegularAffiliateReward,
	calculateSuperReferralProgress,
	isAffiliateEligibleOrderType
} from '$lib/services/affiliate-policy';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';

// Affiliate rewards VEST before they become usable: a reward is recorded as `pending`
// (not counted toward the spendable or withdrawable balance) and only flips to
// `available` after the refund window passes AND the order hasn't been refunded. A
// refund inside the window simply voids the pending reward — nothing to claw back.

const REWARD_VESTING_DAYS_KEY = 'config.affiliate.reward_vesting_days';
export const DEFAULT_REWARD_VESTING_DAYS = 14;
// An order in any of these states means its reward must not vest (void it instead).
const REFUNDED_ORDER_STATUSES = new Set(['refunded', 'cancelled', 'failed', 'expired']);

async function superRewardStillQualifies(
	userId: string,
	metadata: Record<string, unknown>
): Promise<boolean> {
	const kind = String(metadata.kind || '');
	if (kind === 'super_activation') {
		const referredUserId = String(metadata.referredUserId || '');
		if (!referredUserId) return false;
		const orders = await prisma.order.findMany({
			where: {
				AND: [
					buildRevenueOrderWhere(),
					{ userId: referredUserId, affiliateUserId: userId, orderType: 'account' }
				]
			},
			select: { totalAmount: true, refundedAmount: true }
		});
		return calculateSuperReferralProgress({
			orders,
			enabled: true,
			spendThreshold: metadata.activationSpendThreshold,
			orderThreshold: metadata.activationOrderThreshold
		}).activated;
	}

	if (kind === 'super_monthly_bonus') {
		const monthKey = String(metadata.monthKey || '');
		const tierCount = Math.max(1, Number(metadata.tierCount || 0));
		if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
		const start = new Date(`${monthKey}-01T00:00:00.000Z`);
		if (!Number.isFinite(start.getTime())) return false;
		const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
		const validActivations = await prisma.walletTransaction.count({
			where: {
				userId,
				reference: { startsWith: `super:activation:${userId}:` },
				status: { notIn: ['reversed', 'failed', 'cancelled'] },
				NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } },
				createdAt: { gte: start, lt: end }
			}
		});
		return validActivations >= tierCount;
	}

	return true;
}

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
 * Strong same-person/collusion signals available from data FastAccs already collects.
 * A signal never rejects a customer or confiscates earnings automatically: it only holds
 * the reward for admin review so ambiguous household matches cannot leak business money.
 */
export async function detectAffiliateIdentityRiskSignals(
	affiliateUserId: string,
	buyerUserId: string
): Promise<string[]> {
	if (!affiliateUserId || !buyerUserId) return [];
	const signals = new Set<string>();
	const normalizePhone = (value: string | null | undefined): string => {
		const digits = String(value || '').replace(/\D/g, '');
		return digits.length >= 10 ? digits.slice(-10) : digits;
	};

	try {
		const users = await prisma.user.findMany({
			where: { id: { in: [affiliateUserId, buyerUserId] } },
			select: { id: true, phone: true }
		});
		const phones = new Map(users.map((user) => [user.id, normalizePhone(user.phone)]));
		const affiliatePhone = phones.get(affiliateUserId) || '';
		const buyerPhone = phones.get(buyerUserId) || '';
		if (affiliatePhone.length >= 8 && affiliatePhone === buyerPhone) {
			signals.add('shared_phone');
		}
	} catch {
		// If a check that normally works cannot run, protect the business by holding
		// the reward until an admin can inspect it.
		signals.add('identity_check_unavailable');
	}

	const [a, b] = await Promise.all([
		prisma.affiliatePayoutDetails
			.findFirst({
				where: { userId: affiliateUserId },
				select: {
					userId: true,
					accountNumber: true,
					bankName: true,
					accountName: true,
					phone: true,
					feedback: true,
					encryptedPayload: true,
					encryptionKeyId: true,
					accountNumberLast4: true
				}
			})
			.catch(() => null),
		prisma.affiliatePayoutDetails
			.findFirst({
				where: { userId: buyerUserId },
				select: {
					userId: true,
					accountNumber: true,
					bankName: true,
					accountName: true,
					phone: true,
					feedback: true,
					encryptedPayload: true,
					encryptionKeyId: true,
					accountNumberLast4: true
				}
			})
			.catch(() => null)
	]);
	if (!a || !b) return [...signals];
	try {
		const detailsA = decryptAffiliateBankDetails(a);
		const detailsB = decryptAffiliateBankDetails(b);
		const accA = detailsA.accountNumber.trim();
		const accB = detailsB.accountNumber.trim();
		if (
			accA &&
			accB &&
			accA === accB &&
			detailsA.bankName.trim().toLowerCase() === detailsB.bankName.trim().toLowerCase()
		) {
			signals.add('shared_bank_account');
		}
	} catch {
		// If both parties supplied bank details but the signal cannot be evaluated,
		// protect the business by holding the reward for manual review.
		signals.add('payout_details_unverifiable');
	}
	return [...signals];
}

/**
 * Void any still-`pending` regular affiliate reward tied directly to an order.
 * Super rewards are deliberately excluded: the order that triggered an activation may
 * be refunded while the buyer still qualifies through other retained orders. The Super
 * reconciliation path evaluates that complete history before changing money.
 */
export async function voidUnvestedRewardsForOrder(orderId: string): Promise<{ voided: number }> {
	const pending = await prisma.walletTransaction.findMany({
		where: {
			type: 'affiliate_credit',
			status: 'pending',
			OR: [
				{ reference: `affiliate:credit:order:${orderId}` },
				{ metadata: { path: ['orderId'], equals: orderId } }
			]
		},
		select: { id: true, userId: true }
	});
	if (pending.length === 0) return { voided: 0 };
	const result = await prisma.walletTransaction.updateMany({
		where: { id: { in: pending.map((p) => p.id) }, status: 'pending' },
		data: { status: 'reversed' }
	});
	if (result.count > 0) {
		await Promise.allSettled(
			pending.map((row) =>
				recordAffiliateEvent({
					type: 'reward_reversed',
					dedupeKey: `affiliate:reward_reversed:${row.id}`,
					affiliateUserId: row.userId,
					orderId,
					source: 'refund',
					metadata: { rewardTransactionId: row.id, priorStatus: 'pending' }
				})
			)
		);
	}
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
		if (changed) {
			reversed += 1;
			await recordAffiliateEvent({
				type: 'reward_reversed',
				dedupeKey: `affiliate:reward_reversed:${row.id}`,
				affiliateUserId: row.userId,
				orderId,
				source: 'refund',
				metadata: { rewardTransactionId: row.id, priorStatus: 'available' }
			});
		}
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
		where: {
			type: 'affiliate_credit',
			status: 'pending',
			// Rewards held for identity review must never auto-vest, but they also
			// must not occupy a bounded batch forever and starve legitimate rewards.
			NOT: { metadata: { path: ['suspectedSelfReferral'], equals: true } }
		},
		select: { id: true, amount: true, walletId: true, userId: true, metadata: true },
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
		if (!(await superRewardStillQualifies(row.userId, meta))) {
			const result = await prisma.walletTransaction.updateMany({
				where: { id: row.id, status: 'pending' },
				data: { status: 'reversed' }
			});
			voided += result.count;
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
			const availableRewardCount = await tx.walletTransaction.count({
				where: {
					userId: row.userId,
					type: 'affiliate_credit',
					status: 'available'
				}
			});
			if (availableRewardCount === 1) {
				await tx.notification.create({
					data: {
						userId: row.userId,
						type: 'affiliate_store_credit',
						title: 'Your first earning is ready',
						message:
							'Your first referral earning has cleared. You can put it toward an order now or keep earning toward a cash payout.'
					}
				});
			}
			return true;
		});
		if (changed) {
			vested += 1;
			await recordAffiliateEvent({
				type: 'reward_vested',
				dedupeKey: `affiliate:reward_vested:${row.id}`,
				affiliateUserId: row.userId,
				orderId,
				source: 'vesting_cron',
				metadata: { rewardTransactionId: row.id, amount: Number(row.amount || 0) }
			});
		} else skipped += 1;
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
			select: {
				orderType: true,
				subtotal: true,
				storeCreditApplied: true,
				totalAmount: true,
				refundedAmount: true,
				orderItems: {
					select: {
						id: true,
						productName: true,
						totalPrice: true,
						refundedAmount: true,
						category: { select: { metadata: true } }
					}
				}
			}
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
		const policyVersion = Number(metadata.policyVersion || 0);
		const snapshottedIds = Array.isArray(metadata.eligibleOrderItemIds)
			? metadata.eligibleOrderItemIds.filter(
					(value): value is string => typeof value === 'string' && Boolean(value)
				)
			: [];
		let target = 0;
		let commissionBaseAmount: number | null = null;
		if (policyVersion >= 2 && isAffiliateEligibleOrderType(order.orderType)) {
			const commissionablePaidAmount =
				policyVersion >= 3
					? Math.max(0, Number(order.totalAmount || 0) - Number(order.storeCreditApplied || 0))
					: order.totalAmount;
			const recalculated = calculateRegularAffiliateReward({
				subtotal: order.subtotal,
				totalAmount: commissionablePaidAmount,
				orderRefundedAmount: order.refundedAmount,
				orderItems: order.orderItems.map((item) => ({
					id: item.id,
					productName: item.productName,
					totalPrice: item.totalPrice,
					refundedAmount: item.refundedAmount,
					metadata: item.category.metadata
				})),
				rewardPercent: Number(metadata.rewardPercent || 0),
				rewardCap: Number(metadata.rewardCap || originalAward),
				excludedKeywords: [],
				eligibleOrderItemIds: snapshottedIds
			});
			target = recalculated.amount;
			commissionBaseAmount = recalculated.commissionBaseAmount;
		} else {
			// Compatibility for the small set of rewards created before item-level policy
			// snapshots existed. New rewards always take the exact branch above.
			const total = Math.max(0, Number(order.totalAmount || 0));
			const retained = toNetSales(order.totalAmount, order.refundedAmount);
			target = total > 0 ? Math.max(0, Math.round(originalAward * (retained / total))) : 0;
		}
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
						...(commissionBaseAmount === null ? {} : { commissionBaseAmount }),
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
				// The cached wallet cannot fall below zero, but the immutable adjustment must
				// record the full overpayment. That keeps future affiliate earnings offset until
				// the business has recovered the complete amount, even when part was already spent.
				const recoveredAdjustment = Math.min(additionalAdjustment, Math.max(0, balanceBefore));
				const balanceAfter = balanceBefore - recoveredAdjustment;
				if (recoveredAdjustment > 0) {
					await tx.wallet.update({
						where: { id: reward.walletId },
						data: { balance: balanceAfter }
					});
				}
				await tx.walletTransaction.create({
					data: {
						walletId: reward.walletId,
						userId: reward.userId,
						type: SC_AFFILIATE_ADJUSTMENT,
						amount: additionalAdjustment,
						balanceBefore,
						balanceAfter,
						description: 'Affiliate Cash adjusted after a partial order refund',
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
							recoveredAdjustmentAmount: recoveredAdjustment,
							unrecoveredAdjustmentAmount: additionalAdjustment - recoveredAdjustment
						}
					}
				});
			}
		}
	});
}
