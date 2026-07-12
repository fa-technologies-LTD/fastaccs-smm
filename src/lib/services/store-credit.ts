import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';

/**
 * Store Credit — spendable-on-site wallet credit, built on the existing
 * WalletTransaction ledger (single source of truth; no stored balance columns).
 *
 * Two buckets, distinguished by transaction type:
 *  - EARNED/GIFTED  (affiliate earnings + spend gifts): capped at a % of the order,
 *    and cashable out via the existing affiliate payout path.
 *  - REFUND         (money returned on a cancelled/failed order): spends freely up
 *    to 100% of an order, and is SPEND-ONLY (never cashable to bank).
 *
 * Available per bucket = credits(status=available) − redemptions(that bucket)
 * − (earned only) payouts requested/paid.
 */

// Credit transaction types
export const SC_CREDIT_AFFILIATE = 'affiliate_credit'; // existing — earned bucket
export const SC_CREDIT_GIFT = 'store_credit_gift'; // ₦-spend gift — earned bucket
export const SC_CREDIT_REFUND = 'store_credit_refund'; // refund — refund bucket
// Debit (redemption) transaction types — one per bucket so sums stay clean.
export const SC_REDEEM_EARNED = 'store_credit_redemption_earned';
export const SC_REDEEM_REFUND = 'store_credit_redemption_refund';
// Existing cash-out type (earned bucket only).
export const SC_PAYOUT = 'affiliate_payout';

const EARNED_CREDIT_TYPES = [SC_CREDIT_AFFILIATE, SC_CREDIT_GIFT];
const REFUND_CREDIT_TYPES = [SC_CREDIT_REFUND];

// Earned/gifted credit may cover at most this fraction of an order's value.
export const EARNED_REDEMPTION_CAP_PERCENT = 0.3;

export interface StoreCreditBuckets {
	earnedAvailable: number; // capped-spend + cashable
	refundAvailable: number; // free-spend, not cashable
	totalAvailable: number;
}

export interface OrderRedemption {
	refundApplied: number;
	earnedApplied: number;
	totalApplied: number;
}

function naira(value: unknown): number {
	const n = Math.floor(Number(value || 0));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pure: given an order total and the user's available buckets, decide how much
 * credit to apply. Refund credit first (uncapped up to the order), then earned
 * credit (capped at EARNED_REDEMPTION_CAP_PERCENT of the ORDER total). Never
 * exceeds the order total. All values are whole naira.
 */
export function computeOrderRedemption(
	orderTotal: number,
	buckets: Pick<StoreCreditBuckets, 'earnedAvailable' | 'refundAvailable'>,
	options: { earnedCapPercent?: number } = {}
): OrderRedemption {
	const total = naira(orderTotal);
	const refundAvail = naira(buckets.refundAvailable);
	const earnedAvail = naira(buckets.earnedAvailable);
	const capPercent = options.earnedCapPercent ?? EARNED_REDEMPTION_CAP_PERCENT;

	if (total <= 0) return { refundApplied: 0, earnedApplied: 0, totalApplied: 0 };

	// Refund credit first — uncapped, but never more than the order.
	const refundApplied = Math.min(refundAvail, total);
	const remaining = total - refundApplied;

	// Earned credit — capped at capPercent of the ORDER total, and the remainder.
	const earnedCap = Math.floor(total * capPercent);
	const earnedApplied = Math.max(0, Math.min(earnedAvail, earnedCap, remaining));

	const totalApplied = refundApplied + earnedApplied;
	return { refundApplied, earnedApplied, totalApplied };
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Compute a user's spendable store-credit buckets from the ledger. */
export async function getStoreCreditBuckets(userId: string, db: Db = prisma): Promise<StoreCreditBuckets> {
	const grouped = await db.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: {
			userId,
			type: {
				in: [
					SC_CREDIT_AFFILIATE,
					SC_CREDIT_GIFT,
					SC_CREDIT_REFUND,
					SC_REDEEM_EARNED,
					SC_REDEEM_REFUND,
					SC_PAYOUT
				]
			}
		},
		_sum: { amount: true }
	});

	let earnedCredits = 0;
	let refundCredits = 0;
	let earnedRedeemed = 0;
	let refundRedeemed = 0;
	let payoutsOut = 0;

	for (const row of grouped) {
		const amount = Math.max(0, Number(row._sum.amount || 0));
		const type = String(row.type);
		const status = String(row.status || '').toLowerCase();
		if (EARNED_CREDIT_TYPES.includes(type) && status === 'available') earnedCredits += amount;
		else if (REFUND_CREDIT_TYPES.includes(type) && status === 'available') refundCredits += amount;
		// Redemptions only reduce available while active; reversed ones (failed/
		// expired payments) are excluded so the credit is restored.
		else if (type === SC_REDEEM_EARNED && status === 'available') earnedRedeemed += amount;
		else if (type === SC_REDEEM_REFUND && status === 'available') refundRedeemed += amount;
		else if (type === SC_PAYOUT && (status === 'requested' || status === 'paid')) payoutsOut += amount;
	}

	const earnedAvailable = Math.max(0, earnedCredits - earnedRedeemed - payoutsOut);
	const refundAvailable = Math.max(0, refundCredits - refundRedeemed);
	return {
		earnedAvailable,
		refundAvailable,
		totalAvailable: earnedAvailable + refundAvailable
	};
}

/** Credit a user's store credit (refunds, gifts). Runs inside a caller transaction. */
export async function creditStoreCredit(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		amount: number;
		type: typeof SC_CREDIT_REFUND | typeof SC_CREDIT_GIFT;
		description: string;
		reference?: string | null;
		metadata?: Prisma.InputJsonValue;
	}
): Promise<void> {
	const amount = naira(params.amount);
	if (amount <= 0) return;

	const wallet = await tx.wallet.upsert({
		where: { userId: params.userId },
		update: {},
		create: { userId: params.userId, balance: 0, currency: 'NGN' }
	});
	const balanceBefore = Number(wallet.balance || 0);
	const balanceAfter = balanceBefore + amount;

	await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
	await tx.walletTransaction.create({
		data: {
			walletId: wallet.id,
			userId: params.userId,
			type: params.type,
			amount,
			balanceBefore,
			balanceAfter,
			description: params.description,
			reference: params.reference ?? null,
			status: 'available',
			metadata: params.metadata ?? undefined
		}
	});
}

/** Debit store credit for an order redemption (one row per bucket used). */
export async function redeemStoreCreditForOrder(
	tx: Prisma.TransactionClient,
	params: { userId: string; orderId: string; orderNumber: string; redemption: OrderRedemption }
): Promise<void> {
	const { refundApplied, earnedApplied } = params.redemption;
	if (refundApplied <= 0 && earnedApplied <= 0) return;

	const wallet = await tx.wallet.upsert({
		where: { userId: params.userId },
		update: {},
		create: { userId: params.userId, balance: 0, currency: 'NGN' }
	});
	let balance = Number(wallet.balance || 0);

	const rows: Array<{ type: string; amount: number; bucket: string }> = [];
	if (refundApplied > 0) rows.push({ type: SC_REDEEM_REFUND, amount: refundApplied, bucket: 'refund' });
	if (earnedApplied > 0) rows.push({ type: SC_REDEEM_EARNED, amount: earnedApplied, bucket: 'earned' });

	for (const row of rows) {
		const balanceBefore = balance;
		balance = balanceBefore - row.amount;
		await tx.walletTransaction.create({
			data: {
				walletId: wallet.id,
				userId: params.userId,
				type: row.type,
				amount: row.amount,
				balanceBefore,
				balanceAfter: balance,
				description: `Store Credit applied to order ${params.orderNumber}`,
				// One row per bucket; reference has a global unique constraint, so it
				// must be unique per bucket. Reversal matches the `${orderId}:` prefix.
				reference: `${params.orderId}:${row.bucket}`,
				status: 'available',
				metadata: { orderId: params.orderId, bucket: row.bucket }
			}
		});
	}

	await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
}

/**
 * Reverse an order's not-yet-consumed redemption (payment failed or expired):
 * mark the redemption rows reversed (so they stop reducing available credit) and
 * restore the wallet balance. Idempotent — only touches still-active redemptions.
 */
export async function reverseStoreCreditRedemption(
	tx: Prisma.TransactionClient,
	params: { userId: string; orderId: string }
): Promise<void> {
	const debits = await tx.walletTransaction.findMany({
		where: {
			userId: params.userId,
			reference: { startsWith: `${params.orderId}:` },
			type: { in: [SC_REDEEM_EARNED, SC_REDEEM_REFUND] },
			status: 'available'
		},
		select: { id: true, amount: true }
	});
	if (debits.length === 0) return;

	const total = debits.reduce((sum, d) => sum + Math.max(0, Number(d.amount || 0)), 0);
	await tx.walletTransaction.updateMany({
		where: { id: { in: debits.map((d) => d.id) } },
		data: { status: 'reversed' }
	});

	if (total > 0) {
		const wallet = await tx.wallet.findUnique({ where: { userId: params.userId } });
		if (wallet) {
			await tx.wallet.update({
				where: { id: wallet.id },
				data: { balance: Number(wallet.balance || 0) + total }
			});
		}
	}
}
