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
// Append-only debit used when a partial refund reduces an already-vested affiliate reward.
export const SC_AFFILIATE_ADJUSTMENT = 'affiliate_credit_adjustment';
// Existing cash-out type (earned bucket only).
export const SC_PAYOUT = 'affiliate_payout';

// Human category per transaction type, for the customer-facing ledger.
const SC_CATEGORY: Record<string, string> = {
	[SC_CREDIT_AFFILIATE]: 'Affiliate commission',
	[SC_CREDIT_GIFT]: 'Gift',
	[SC_CREDIT_REFUND]: 'Refund',
	[SC_REDEEM_EARNED]: 'Spent',
	[SC_REDEEM_REFUND]: 'Spent',
	[SC_AFFILIATE_ADJUSTMENT]: 'Commission adjustment',
	[SC_PAYOUT]: 'Payout'
};

export interface StoreCreditEntry {
	at: string;
	description: string;
	delta: number; // + credit, − debit (whole naira)
	kind: 'credit' | 'debit';
	category: string;
}

/**
 * A user's store-credit ledger for the dashboard (most recent first). Sign is derived from the
 * stored balanceBefore/After so it's always correct regardless of how the row was written.
 */
export async function getStoreCreditHistory(
	userId: string,
	limit = 50
): Promise<StoreCreditEntry[]> {
	const rows = await prisma.walletTransaction.findMany({
		where: { userId, status: { notIn: ['failed', 'reversed', 'cancelled'] } },
		orderBy: { createdAt: 'desc' },
		take: limit,
		select: {
			type: true,
			balanceBefore: true,
			balanceAfter: true,
			description: true,
			createdAt: true
		}
	});
	return rows.map((r) => {
		const delta = Math.round(Number(r.balanceAfter) - Number(r.balanceBefore));
		return {
			at: r.createdAt.toISOString(),
			description: r.description,
			delta,
			kind: delta >= 0 ? ('credit' as const) : ('debit' as const),
			category: SC_CATEGORY[r.type] ?? (delta >= 0 ? 'Credit' : 'Spent')
		};
	});
}

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

/**
 * True if a redemption asks for more than the buckets actually hold (whole-naira tolerance).
 * The guard against concurrent store-credit over-spend: checked under a wallet row-lock, so a
 * second simultaneous checkout that would push a bucket negative is refused, not silently leaked.
 */
export function redemptionExceedsAvailable(
	redemption: Pick<OrderRedemption, 'refundApplied' | 'earnedApplied'>,
	buckets: Pick<StoreCreditBuckets, 'refundAvailable' | 'earnedAvailable'>
): boolean {
	return (
		redemption.refundApplied - buckets.refundAvailable > 0.5 ||
		redemption.earnedApplied - buckets.earnedAvailable > 0.5
	);
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Compute a user's spendable store-credit buckets from the ledger. */
export async function getStoreCreditBuckets(
	userId: string,
	db: Db = prisma
): Promise<StoreCreditBuckets> {
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
					SC_AFFILIATE_ADJUSTMENT,
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
		else if (type === SC_AFFILIATE_ADJUSTMENT && status === 'available') earnedRedeemed += amount;
		else if (
			type === SC_PAYOUT &&
			(status === 'requested' || status === 'under_review' || status === 'paid')
		)
			payoutsOut += amount;
	}

	const earnedAvailable = Math.max(0, earnedCredits - earnedRedeemed - payoutsOut);
	const refundAvailable = Math.max(0, refundCredits - refundRedeemed);
	return {
		earnedAvailable,
		refundAvailable,
		totalAvailable: earnedAvailable + refundAvailable
	};
}

/**
 * Batched, ledger-derived spendable store credit for many users at once
 * (one query). Use this for lists instead of the cached wallet.balance, which
 * can drift from the ledger source of truth.
 */
export async function getStoreCreditTotalsForUsers(
	userIds: string[]
): Promise<Map<string, number>> {
	const result = new Map<string, number>();
	if (userIds.length === 0) return result;

	const grouped = await prisma.walletTransaction.groupBy({
		by: ['userId', 'type', 'status'],
		where: {
			userId: { in: userIds },
			type: {
				in: [
					SC_CREDIT_AFFILIATE,
					SC_CREDIT_GIFT,
					SC_CREDIT_REFUND,
					SC_REDEEM_EARNED,
					SC_REDEEM_REFUND,
					SC_AFFILIATE_ADJUSTMENT,
					SC_PAYOUT
				]
			}
		},
		_sum: { amount: true }
	});

	const acc = new Map<string, { ec: number; rc: number; er: number; rr: number; po: number }>();
	for (const row of grouped) {
		if (!row.userId) continue;
		const u = acc.get(row.userId) || { ec: 0, rc: 0, er: 0, rr: 0, po: 0 };
		const amount = Math.max(0, Number(row._sum.amount || 0));
		const type = String(row.type);
		const status = String(row.status || '').toLowerCase();
		if (EARNED_CREDIT_TYPES.includes(type) && status === 'available') u.ec += amount;
		else if (REFUND_CREDIT_TYPES.includes(type) && status === 'available') u.rc += amount;
		else if (type === SC_REDEEM_EARNED && status === 'available') u.er += amount;
		else if (type === SC_REDEEM_REFUND && status === 'available') u.rr += amount;
		else if (type === SC_AFFILIATE_ADJUSTMENT && status === 'available') u.er += amount;
		else if (
			type === SC_PAYOUT &&
			(status === 'requested' || status === 'under_review' || status === 'paid')
		)
			u.po += amount;
		acc.set(row.userId, u);
	}
	for (const [userId, u] of acc) {
		result.set(userId, Math.max(0, u.ec - u.er - u.po) + Math.max(0, u.rc - u.rr));
	}
	return result;
}

/**
 * Total spendable credit currently owed to customers. This is ledger-derived and
 * therefore does not trust the cached wallet balance. Requested/paid affiliate
 * payouts are no longer spendable credit and are excluded here.
 */
export async function getTotalStoreCreditLiability(db: Db = prisma): Promise<number> {
	const grouped = await db.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: {
			type: {
				in: [
					SC_CREDIT_AFFILIATE,
					SC_CREDIT_GIFT,
					SC_CREDIT_REFUND,
					SC_REDEEM_EARNED,
					SC_REDEEM_REFUND,
					SC_AFFILIATE_ADJUSTMENT,
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
		else if (type === SC_REDEEM_EARNED && status === 'available') earnedRedeemed += amount;
		else if (type === SC_REDEEM_REFUND && status === 'available') refundRedeemed += amount;
		else if (type === SC_AFFILIATE_ADJUSTMENT && status === 'available') earnedRedeemed += amount;
		else if (
			type === SC_PAYOUT &&
			(status === 'requested' || status === 'under_review' || status === 'paid')
		) {
			payoutsOut += amount;
		}
	}

	return (
		Math.max(0, earnedCredits - earnedRedeemed - payoutsOut) +
		Math.max(0, refundCredits - refundRedeemed)
	);
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

	// Every operation that changes the cached wallet balance takes the same row lock.
	// Without this, two legitimate credits with different references can both read the
	// same old balance and the later update silently overwrites the first one.
	await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId}::uuid FOR UPDATE`;

	// A reference identifies one business event (for example one order refund). Treat an
	// exact replay as success, but never let a reused reference hide a different credit.
	if (params.reference) {
		const existing = await tx.walletTransaction.findUnique({
			where: { reference: params.reference },
			select: { userId: true, type: true, amount: true }
		});
		if (existing) {
			if (
				existing.userId !== params.userId ||
				existing.type !== params.type ||
				Number(existing.amount) !== amount
			) {
				throw new Error('STORE_CREDIT_REFERENCE_CONFLICT');
			}
			return;
		}
	}

	// The upsert result may have been read before a concurrent transaction released the
	// lock. Re-read after acquiring it so balanceBefore/After remains a coherent audit trail.
	const liveWallet = await tx.wallet.findUnique({
		where: { id: wallet.id },
		select: { balance: true }
	});
	if (!liveWallet) throw new Error('STORE_CREDIT_WALLET_NOT_FOUND');

	const balanceBefore = Number(liveWallet.balance || 0);
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

	// Lock this wallet row for the rest of the transaction so two checkouts fired at the
	// same instant can't both spend the same balance (TOCTOU race → store-credit over-spend).
	// A concurrent redemption blocks here until we commit, then re-reads the reduced balance.
	await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId}::uuid FOR UPDATE`;
	const liveWallet = await tx.wallet.findUnique({
		where: { id: wallet.id },
		select: { balance: true }
	});
	if (!liveWallet) throw new Error('STORE_CREDIT_WALLET_NOT_FOUND');

	// Re-verify sufficiency from the ledger now that we hold the lock (the amount was computed
	// earlier, outside the transaction). If the balance moved under us, refuse rather than leak.
	const liveBuckets = await getStoreCreditBuckets(params.userId, tx);
	if (redemptionExceedsAvailable(params.redemption, liveBuckets)) {
		throw new Error('INSUFFICIENT_STORE_CREDIT');
	}

	let balance = Number(liveWallet.balance || 0);

	const rows: Array<{ type: string; amount: number; bucket: string }> = [];
	if (refundApplied > 0)
		rows.push({ type: SC_REDEEM_REFUND, amount: refundApplied, bucket: 'refund' });
	if (earnedApplied > 0)
		rows.push({ type: SC_REDEEM_EARNED, amount: earnedApplied, bucket: 'earned' });

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
	const wallet = await tx.wallet.findUnique({
		where: { userId: params.userId },
		select: { id: true }
	});
	if (!wallet) return;

	// Serialize reversals with credits and redemptions for this buyer. Selecting the
	// debit rows only after the lock also makes two recovery workers safely idempotent.
	await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId}::uuid FOR UPDATE`;

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
		const liveWallet = await tx.wallet.findUnique({
			where: { id: wallet.id },
			select: { balance: true }
		});
		if (!liveWallet) throw new Error('STORE_CREDIT_WALLET_NOT_FOUND');
		await tx.wallet.update({
			where: { id: wallet.id },
			data: { balance: Number(liveWallet.balance || 0) + total }
		});
	}
}

/**
 * Re-reserve credit that was restored after a failed/expired split payment when the
 * gateway later proves the cash portion succeeded. Runs under the caller's order lock
 * and takes the wallet lock second, matching the refund lock order.
 *
 * If the buyer has already spent the restored credit, refuse rather than fulfilling an
 * underfunded order. The paid cash portion then requires explicit operator review.
 */
export async function restoreStoreCreditRedemptionForLatePayment(
	tx: Prisma.TransactionClient,
	params: { userId: string; orderId: string; expectedAmount: number }
): Promise<{ restoredAmount: number; alreadyReserved: boolean }> {
	const expectedAmount = naira(params.expectedAmount);
	if (expectedAmount <= 0) return { restoredAmount: 0, alreadyReserved: true };

	const wallet = await tx.wallet.findUnique({
		where: { userId: params.userId },
		select: { id: true }
	});
	if (!wallet) throw new Error('STORE_CREDIT_LATE_PAYMENT_WALLET_NOT_FOUND');

	await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId}::uuid FOR UPDATE`;

	const debits = await tx.walletTransaction.findMany({
		where: {
			userId: params.userId,
			reference: { startsWith: `${params.orderId}:` },
			type: { in: [SC_REDEEM_EARNED, SC_REDEEM_REFUND] }
		},
		select: { id: true, type: true, amount: true, status: true }
	});
	const supported = debits.filter((row) => ['available', 'reversed'].includes(row.status));
	const recordedAmount = supported.reduce(
		(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
		0
	);
	if (supported.length !== debits.length || Math.abs(recordedAmount - expectedAmount) > 0.5) {
		throw new Error('STORE_CREDIT_LATE_PAYMENT_REDEMPTION_MISMATCH');
	}

	const reversed = supported.filter((row) => row.status === 'reversed');
	if (reversed.length === 0) return { restoredAmount: 0, alreadyReserved: true };

	const refundApplied = reversed
		.filter((row) => row.type === SC_REDEEM_REFUND)
		.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
	const earnedApplied = reversed
		.filter((row) => row.type === SC_REDEEM_EARNED)
		.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
	const liveBuckets = await getStoreCreditBuckets(params.userId, tx);
	if (redemptionExceedsAvailable({ refundApplied, earnedApplied }, liveBuckets)) {
		throw new Error('STORE_CREDIT_LATE_PAYMENT_INSUFFICIENT');
	}

	const liveWallet = await tx.wallet.findUnique({
		where: { id: wallet.id },
		select: { balance: true }
	});
	const restoredAmount = refundApplied + earnedApplied;
	if (!liveWallet || Number(liveWallet.balance || 0) + 0.5 < restoredAmount) {
		throw new Error('STORE_CREDIT_LATE_PAYMENT_BALANCE_MISMATCH');
	}

	const reactivated = await tx.walletTransaction.updateMany({
		where: { id: { in: reversed.map((row) => row.id) }, status: 'reversed' },
		data: { status: 'available' }
	});
	if (reactivated.count !== reversed.length) {
		throw new Error('STORE_CREDIT_LATE_PAYMENT_REDEMPTION_CHANGED');
	}
	await tx.wallet.update({
		where: { id: wallet.id },
		data: { balance: Number(liveWallet.balance || 0) - restoredAmount }
	});

	return { restoredAmount, alreadyReserved: false };
}
