import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { moneyNgn } from '$lib/helpers/money';
import {
	groupWeeklyCommissions,
	isSuperCommissionReference,
	weeklyCommissionTitle
} from '$lib/helpers/super-earnings-grouping';
import type { OrderRedemption } from '$lib/helpers/store-credit-redemption';
import {
	allocatePromoSpend,
	computePromoLotBalances,
	promoAvailable as sumPromoAvailable,
	promoBalancesByCampaign,
	type PromoCampaignBalance,
	type PromoDebit,
	type PromoLot,
	type PromoLotBalance
} from '$lib/helpers/promo-credit';
export {
	computeOrderRedemption,
	EARNED_REDEMPTION_CAP_PERCENT,
	type OrderRedemption
} from '$lib/helpers/store-credit-redemption';

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
 *
 * A third bucket, PROMO (Refer & Win, BIGSPENDER), is made of grants ("lots") that each expire.
 * It is spend-only, capped per campaign, and never counts as cash anywhere.
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
// Promo bucket: one credit row per grant (lot), with metadata { campaign, expiresAt }.
export const SC_CREDIT_PROMO = 'store_credit_promo';
export const SC_REDEEM_PROMO = 'store_credit_redemption_promo'; // metadata.lots = [{ lotId, amount }]
export const SC_PROMO_EXPIRY = 'store_credit_promo_expiry'; // metadata.lotId
export const SC_PROMO_REVERSAL = 'store_credit_promo_reversal'; // metadata.lotId
// Moves the promo-paid part of a refunded order out of refund credit and back into promo credit.
export const SC_REFUND_TO_PROMO = 'store_credit_refund_to_promo';
// Moves the rewards-credit-paid part of a refunded order out of refund credit, back to rewards credit.
export const SC_REFUND_TO_EARNED = 'store_credit_refund_to_earned';
export const PROMO_DEFAULT_EXPIRY_DAYS = 30;

// Human category per transaction type, for the customer-facing ledger.
const SC_CATEGORY: Record<string, string> = {
	[SC_CREDIT_AFFILIATE]: 'Affiliate Cash',
	[SC_CREDIT_GIFT]: 'Gift',
	[SC_CREDIT_REFUND]: 'Refund',
	[SC_REDEEM_EARNED]: 'Spent',
	[SC_REDEEM_REFUND]: 'Spent',
	[SC_AFFILIATE_ADJUSTMENT]: 'Affiliate Cash adjustment',
	[SC_PAYOUT]: 'Payout',
	[SC_CREDIT_PROMO]: 'Promo credit',
	[SC_REDEEM_PROMO]: 'Spent',
	[SC_PROMO_EXPIRY]: 'Expired',
	[SC_PROMO_REVERSAL]: 'Promo credit removed',
	[SC_REFUND_TO_PROMO]: 'Refund',
	[SC_REFUND_TO_EARNED]: 'Refund'
};

export interface StoreCreditEntry {
	at: string;
	description: string;
	delta: number; // + credit, − debit (NGN including kobo)
	kind: 'credit' | 'debit';
	category: string;
	status: string;
	/** Proof of payment for a paid payout, served only to this user (and admins). */
	receiptUrl?: string;
}

const STORE_CREDIT_HISTORY_TYPES = [
	SC_CREDIT_AFFILIATE,
	SC_CREDIT_GIFT,
	SC_CREDIT_REFUND,
	SC_REDEEM_EARNED,
	SC_REDEEM_REFUND,
	SC_AFFILIATE_ADJUSTMENT,
	SC_PAYOUT,
	SC_CREDIT_PROMO,
	SC_REDEEM_PROMO,
	SC_PROMO_EXPIRY,
	SC_PROMO_REVERSAL,
	SC_REFUND_TO_PROMO,
	SC_REFUND_TO_EARNED
] as const;

const STORE_CREDIT_DEBIT_TYPES = new Set<string>([
	SC_REDEEM_EARNED,
	SC_REDEEM_REFUND,
	SC_AFFILIATE_ADJUSTMENT,
	SC_PAYOUT,
	SC_REDEEM_PROMO,
	SC_PROMO_EXPIRY,
	SC_PROMO_REVERSAL,
	SC_REFUND_TO_PROMO,
	SC_REFUND_TO_EARNED
]);

/**
 * A user's store-credit ledger for the dashboard (most recent first). Transaction
 * type and amount are authoritative: payout reservations and pending rewards do not
 * mutate the cached wallet balance, so balanceBefore/After can legitimately be equal.
 */
export async function getStoreCreditHistory(
	userId: string,
	limit = 50
): Promise<StoreCreditEntry[]> {
	const rows = await prisma.walletTransaction.findMany({
		where: {
			userId,
			type: { in: [...STORE_CREDIT_HISTORY_TYPES] },
			status: { notIn: ['failed', 'reversed', 'cancelled'] }
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		select: {
			id: true,
			type: true,
			amount: true,
			status: true,
			description: true,
			createdAt: true,
			reference: true,
			metadata: true
		}
	});
	// Super order earnings appear as weekly totals across all friends, never per order.
	const weeklySuper: StoreCreditEntry[] = groupWeeklyCommissions(
		rows
			.filter((r) => r.type === SC_CREDIT_AFFILIATE && isSuperCommissionReference(r.reference))
			.map((r) => ({
				amount: moneyNgn(r.amount),
				status: String(r.status || ''),
				createdAt: r.createdAt,
				buyerUserId:
					r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
						? String((r.metadata as Record<string, unknown>).buyerUserId || '') || null
						: null
			}))
	).map((group) => ({
		at: group.latestAt.toISOString(),
		description: weeklyCommissionTitle(group),
		delta: group.amount,
		kind: 'credit' as const,
		category: SC_CATEGORY[SC_CREDIT_AFFILIATE],
		status: group.status
	}));
	const individual = rows
		.filter((r) => !(r.type === SC_CREDIT_AFFILIATE && isSuperCommissionReference(r.reference)))
		.map((r) => {
			const kind = STORE_CREDIT_DEBIT_TYPES.has(r.type) ? ('debit' as const) : ('credit' as const);
			const amount = moneyNgn(r.amount);
			const delta = kind === 'debit' ? -amount : amount;
			return {
				at: r.createdAt.toISOString(),
				description: r.description,
				delta,
				kind,
				category: SC_CATEGORY[r.type] ?? (kind === 'credit' ? 'Credit' : 'Spent'),
				status: String(r.status || ''),
				...(r.type === SC_PAYOUT && metadataRecord(r.metadata).receipt
					? { receiptUrl: `/api/payouts/${r.id}/receipt` }
					: {})
			};
		});
	return [...weeklySuper, ...individual].sort((a, b) => b.at.localeCompare(a.at));
}

const EARNED_CREDIT_TYPES = [SC_CREDIT_AFFILIATE, SC_CREDIT_GIFT];
const REFUND_CREDIT_TYPES = [SC_CREDIT_REFUND];

export interface StoreCreditBuckets {
	earnedAvailable: number; // capped-spend + cashable
	refundAvailable: number; // free-spend, not cashable
	promoAvailable: number; // capped per campaign, expires, not cashable
	promo: PromoCampaignBalance[];
	totalAvailable: number;
}

// Every ledger type that moves a bucket (grouped sums are enough except for promo lots).
const BUCKET_TYPES = [
	SC_CREDIT_AFFILIATE,
	SC_CREDIT_GIFT,
	SC_CREDIT_REFUND,
	SC_REDEEM_EARNED,
	SC_REDEEM_REFUND,
	SC_AFFILIATE_ADJUSTMENT,
	SC_PAYOUT,
	SC_CREDIT_PROMO,
	SC_REFUND_TO_PROMO,
	SC_REFUND_TO_EARNED
];
const PROMO_DEBIT_TYPES = [SC_REDEEM_PROMO, SC_PROMO_EXPIRY, SC_PROMO_REVERSAL];

interface BucketSums {
	earnedCredits: number;
	refundCredits: number;
	earnedRedeemed: number;
	refundRedeemed: number;
	payoutsOut: number;
	promoCredits: number;
}

const emptySums = (): BucketSums => ({
	earnedCredits: 0,
	refundCredits: 0,
	earnedRedeemed: 0,
	refundRedeemed: 0,
	payoutsOut: 0,
	promoCredits: 0
});

function addToSums(sums: BucketSums, type: string, rawStatus: unknown, rawAmount: unknown): void {
	const amount = Math.max(0, Number(rawAmount || 0));
	const status = String(rawStatus || '').toLowerCase();
	if (EARNED_CREDIT_TYPES.includes(type) && status === 'available') sums.earnedCredits += amount;
	else if (REFUND_CREDIT_TYPES.includes(type) && status === 'available')
		sums.refundCredits += amount;
	// Redemptions only reduce available while active; reversed ones (failed/
	// expired payments) are excluded so the credit is restored.
	else if (type === SC_REDEEM_EARNED && status === 'available') sums.earnedRedeemed += amount;
	else if (type === SC_REDEEM_REFUND && status === 'available') sums.refundRedeemed += amount;
	else if ((type === SC_REFUND_TO_PROMO || type === SC_REFUND_TO_EARNED) && status === 'available')
		sums.refundRedeemed += amount;
	else if (type === SC_AFFILIATE_ADJUSTMENT && status === 'available')
		sums.earnedRedeemed += amount;
	else if (type === SC_CREDIT_PROMO && status === 'available') sums.promoCredits += amount;
	else if (
		type === SC_PAYOUT &&
		(status === 'requested' || status === 'under_review' || status === 'paid')
	)
		sums.payoutsOut += amount;
}

function metadataRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function promoLotFromRow(row: {
	id: string;
	amount: unknown;
	createdAt: Date;
	metadata: unknown;
}): PromoLot {
	const metadata = metadataRecord(row.metadata);
	const expiry = new Date(String(metadata.expiresAt ?? ''));
	return {
		id: row.id,
		campaign: typeof metadata.campaign === 'string' ? metadata.campaign : 'promo',
		amount: Math.max(0, Number(row.amount || 0)),
		createdAt: row.createdAt,
		// A lot always carries its expiry; the fallback only protects against a malformed row.
		expiresAt: Number.isNaN(expiry.getTime())
			? new Date(row.createdAt.getTime() + PROMO_DEFAULT_EXPIRY_DAYS * 86_400_000)
			: expiry
	};
}

function promoDebitFromRow(row: {
	amount: unknown;
	createdAt: Date;
	metadata: unknown;
}): PromoDebit {
	const metadata = metadataRecord(row.metadata);
	const lots = Array.isArray(metadata.lots)
		? metadata.lots
				.map((part) => metadataRecord(part))
				.filter((part) => typeof part.lotId === 'string')
				.map((part) => ({
					lotId: String(part.lotId),
					amount: Math.max(0, Number(part.amount) || 0)
				}))
		: undefined;
	return {
		amount: Math.max(0, Number(row.amount || 0)),
		createdAt: row.createdAt,
		lots,
		lotId: typeof metadata.lotId === 'string' ? metadata.lotId : null
	};
}

/** Promo lots with what is left of each, per user (credit rows plus every active promo debit). */
async function loadPromoLotBalances(
	db: Db,
	userFilter: string | { in: string[] } | undefined,
	now: Date = new Date()
): Promise<Map<string, PromoLotBalance[]>> {
	const userWhere = userFilter === undefined ? {} : { userId: userFilter };
	const [lotRows, debitRows] = await Promise.all([
		db.walletTransaction.findMany({
			where: { ...userWhere, type: SC_CREDIT_PROMO, status: 'available' },
			select: { id: true, userId: true, amount: true, createdAt: true, metadata: true }
		}),
		db.walletTransaction.findMany({
			where: { ...userWhere, type: { in: PROMO_DEBIT_TYPES }, status: 'available' },
			select: { userId: true, amount: true, createdAt: true, metadata: true }
		})
	]);
	const lotsByUser = new Map<string, PromoLot[]>();
	for (const row of lotRows) {
		if (!row.userId) continue;
		lotsByUser.set(row.userId, [...(lotsByUser.get(row.userId) ?? []), promoLotFromRow(row)]);
	}
	const debitsByUser = new Map<string, PromoDebit[]>();
	for (const row of debitRows) {
		if (!row.userId) continue;
		debitsByUser.set(row.userId, [...(debitsByUser.get(row.userId) ?? []), promoDebitFromRow(row)]);
	}
	const result = new Map<string, PromoLotBalance[]>();
	for (const [userId, lots] of lotsByUser) {
		result.set(userId, computePromoLotBalances(lots, debitsByUser.get(userId) ?? [], now));
	}
	return result;
}

/** One user's promo lots and what is left of each (expired lots included, flagged). */
export async function getPromoLotBalances(
	userId: string,
	db: Db = prisma,
	now: Date = new Date()
): Promise<PromoLotBalance[]> {
	return (await loadPromoLotBalances(db, userId, now)).get(userId) ?? [];
}

/** Every user's promo lots (for the expiry job and campaign reports; promo volume is small). */
export async function getAllPromoLotBalances(
	db: Db = prisma,
	now: Date = new Date()
): Promise<Map<string, PromoLotBalance[]>> {
	return loadPromoLotBalances(db, undefined, now);
}

function naira(value: unknown): number {
	const n = Math.floor(Number(value || 0));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * True if a redemption asks for more than the buckets actually hold (sub-kobo tolerance).
 * The guard against concurrent store-credit over-spend: checked under a wallet row-lock, so a
 * second simultaneous checkout that would push a bucket negative is refused, not silently leaked.
 */
export function redemptionExceedsAvailable(
	redemption: Pick<OrderRedemption, 'refundApplied' | 'earnedApplied' | 'promoApplied'>,
	buckets: Pick<StoreCreditBuckets, 'refundAvailable' | 'earnedAvailable'> &
		Partial<Pick<StoreCreditBuckets, 'promoAvailable'>>
): boolean {
	return (
		redemption.refundApplied - buckets.refundAvailable > 0.005 ||
		redemption.earnedApplied - buckets.earnedAvailable > 0.005 ||
		(redemption.promoApplied ?? 0) - (buckets.promoAvailable ?? 0) > 0.005
	);
}

/** Compute a user's spendable store-credit buckets from the ledger. */
export async function getStoreCreditBuckets(
	userId: string,
	db: Db = prisma
): Promise<StoreCreditBuckets> {
	const grouped = await db.walletTransaction.groupBy({
		by: ['type', 'status'],
		where: { userId, type: { in: BUCKET_TYPES } },
		_sum: { amount: true }
	});

	const sums = emptySums();
	for (const row of grouped) addToSums(sums, String(row.type), row.status, row._sum.amount);

	const earnedAvailable = Math.max(0, sums.earnedCredits - sums.earnedRedeemed - sums.payoutsOut);
	const refundAvailable = Math.max(0, sums.refundCredits - sums.refundRedeemed);
	// Lots are only read for the few buyers who have ever held promo credit.
	const lots = sums.promoCredits > 0 ? await getPromoLotBalances(userId, db) : [];
	const promoAvailable = sumPromoAvailable(lots);
	return {
		earnedAvailable,
		refundAvailable,
		promoAvailable,
		promo: promoBalancesByCampaign(lots),
		totalAvailable: earnedAvailable + refundAvailable + promoAvailable
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
		where: { userId: { in: userIds }, type: { in: BUCKET_TYPES } },
		_sum: { amount: true }
	});

	const acc = new Map<string, BucketSums>();
	for (const row of grouped) {
		if (!row.userId) continue;
		const sums = acc.get(row.userId) || emptySums();
		addToSums(sums, String(row.type), row.status, row._sum.amount);
		acc.set(row.userId, sums);
	}
	const promoUsers = [...acc].filter(([, u]) => u.promoCredits > 0).map(([userId]) => userId);
	const promoLots =
		promoUsers.length > 0
			? await loadPromoLotBalances(prisma, { in: promoUsers })
			: new Map<string, PromoLotBalance[]>();
	for (const [userId, u] of acc) {
		result.set(
			userId,
			Math.max(0, u.earnedCredits - u.earnedRedeemed - u.payoutsOut) +
				Math.max(0, u.refundCredits - u.refundRedeemed) +
				sumPromoAvailable(promoLots.get(userId) ?? [])
		);
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
		where: { type: { in: BUCKET_TYPES } },
		_sum: { amount: true }
	});

	const sums = emptySums();
	for (const row of grouped) addToSums(sums, String(row.type), row.status, row._sum.amount);
	let promoOwed = 0;
	if (sums.promoCredits > 0) {
		for (const lots of (await getAllPromoLotBalances(db)).values()) {
			promoOwed += sumPromoAvailable(lots);
		}
	}

	return (
		Math.max(0, sums.earnedCredits - sums.earnedRedeemed - sums.payoutsOut) +
		Math.max(0, sums.refundCredits - sums.refundRedeemed) +
		promoOwed
	);
}

/**
 * Append one credit row under the buyer's wallet lock. Returns null for an exact replay of the same
 * referenced credit; throws if a reference is reused for a different credit.
 */
async function writeLockedCredit(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		amount: number;
		type: string;
		description: string;
		reference?: string | null;
		metadata?: Prisma.InputJsonValue;
	}
): Promise<{ transactionId: string | null; walletId: string; balanceAfter: number } | null> {
	const amount = params.amount;
	const wallet = await tx.wallet.upsert({
		where: { userId: params.userId },
		// A non-empty, balance-neutral update lets Prisma use PostgreSQL's atomic
		// ON CONFLICT path. Empty update falls back to read/create and can race
		// when two first-ever credits try to create the same buyer's wallet.
		update: { balance: { increment: 0 } },
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
			return null;
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
	const created = await tx.walletTransaction.create({
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
	return {
		transactionId: (created as { id?: string } | undefined)?.id ?? null,
		walletId: wallet.id,
		balanceAfter
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
	const amount = params.type === SC_CREDIT_REFUND ? moneyNgn(params.amount) : naira(params.amount);
	if (amount <= 0) return;

	const written = await writeLockedCredit(tx, { ...params, amount });
	if (!written || params.type !== SC_CREDIT_REFUND) return;
	const orderId = metadataRecord(params.metadata).orderId;
	if (typeof orderId === 'string' && orderId) {
		// Both moves leave the wallet total unchanged, so they share the post-credit balance. The
		// order's refund share is only looked up when the order used promo or rewards credit.
		let share: Promise<RefundShare> | null = null;
		const getShare = () => (share ??= refundedShareOfOrder(tx, params.userId, orderId));
		const promoReturned = await returnPromoPartOfRefund(tx, {
			userId: params.userId,
			orderId,
			walletId: written.walletId,
			refundAmount: amount,
			balance: written.balanceAfter,
			getShare
		});
		await returnEarnedPartOfRefund(tx, {
			userId: params.userId,
			orderId,
			orderNumber: metadataRecord(params.metadata).orderNumber,
			walletId: written.walletId,
			refundAmount: amount - promoReturned,
			balance: written.balanceAfter,
			getShare
		});
	}
}

interface RefundShare {
	orderTotal: number;
	refunded: number;
}

/** Order total and how much of it has been refunded to store credit so far (this refund included). */
async function refundedShareOfOrder(
	tx: Prisma.TransactionClient,
	userId: string,
	orderId: string
): Promise<RefundShare> {
	const [order, refunds] = await Promise.all([
		tx.order.findUnique({ where: { id: orderId }, select: { totalAmount: true } }),
		tx.walletTransaction.aggregate({
			where: {
				userId,
				type: SC_CREDIT_REFUND,
				status: { notIn: ['failed', 'reversed', 'cancelled'] },
				metadata: { path: ['orderId'], equals: orderId }
			},
			_sum: { amount: true }
		})
	]);
	return { orderTotal: moneyNgn(order?.totalAmount), refunded: moneyNgn(refunds._sum.amount) };
}

/** The share of `spent` that belongs to what has been refunded so far (whole naira). */
function refundedPart(spent: number, share: RefundShare): number {
	return share.orderTotal <= 0 || share.refunded + 0.005 >= share.orderTotal
		? spent
		: Math.min(spent, Math.floor((share.refunded * spent) / share.orderTotal));
}

/**
 * Rewards credit (affiliate earnings and gifts) is capped at 30% of an order. Without this, a
 * refund would hand the rewards-paid part back as uncapped refund credit. Instead the refunded
 * share goes back to rewards credit: the order's "rewards credit used" record is re-recorded at the
 * amount still kept, so balances and affiliate cash-out maths pick it up unchanged.
 */
async function returnEarnedPartOfRefund(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		orderId: string;
		orderNumber: unknown;
		walletId: string;
		refundAmount: number;
		balance: number;
		getShare: () => Promise<RefundShare>;
	}
): Promise<number> {
	const first = await tx.walletTransaction.findUnique({
		where: { reference: `${params.orderId}:earned` },
		select: { type: true, userId: true }
	});
	if (first?.type !== SC_REDEEM_EARNED || first.userId !== params.userId) return 0;
	const rows = await tx.walletTransaction.findMany({
		where: {
			userId: params.userId,
			type: SC_REDEEM_EARNED,
			reference: { startsWith: `${params.orderId}:earned` }
		},
		select: { id: true, reference: true, amount: true, status: true }
	});
	const original = rows.find((row) => row.reference === `${params.orderId}:earned`);
	if (!original) return 0;
	const spent = naira(original.amount);
	const active = rows.filter((row) => row.status === 'available');
	const activeKept = active.reduce((sum, row) => sum + naira(row.amount), 0);
	const alreadyReturned = Math.max(0, spent - activeKept);
	const target = refundedPart(spent, await params.getShare());
	const toReturn = Math.min(Math.floor(params.refundAmount), target - alreadyReturned, activeKept);
	if (toReturn <= 0) return 0;
	const kept = activeKept - toReturn;

	await tx.walletTransaction.updateMany({
		where: { id: { in: active.map((row) => row.id) }, status: 'available' },
		data: { status: 'reversed' }
	});
	let balance = params.balance;
	await tx.walletTransaction.create({
		data: {
			walletId: params.walletId,
			userId: params.userId,
			type: SC_REFUND_TO_EARNED,
			amount: toReturn,
			balanceBefore: balance,
			balanceAfter: balance - toReturn,
			description: 'Part paid with rewards credit, returned as rewards credit',
			reference: `earned:refund-return:${params.orderId}:${target}`,
			status: 'available',
			metadata: { orderId: params.orderId, earnedReturned: toReturn }
		}
	});
	balance = balance - toReturn + activeKept;
	if (kept > 0) {
		await tx.walletTransaction.create({
			data: {
				walletId: params.walletId,
				userId: params.userId,
				type: SC_REDEEM_EARNED,
				amount: kept,
				balanceBefore: balance,
				balanceAfter: balance - kept,
				description:
					`Store Credit applied to order ${typeof params.orderNumber === 'string' ? params.orderNumber : ''}`.trim(),
				reference: `${params.orderId}:earned:kept:${target}`,
				status: 'available',
				metadata: { orderId: params.orderId, bucket: 'earned', keptAfterPartialRefund: true }
			}
		});
	}
	return toReturn;
}

/**
 * A refund credits the whole refunded amount as refund credit. If the order was partly paid with
 * promo credit, the matching share is moved back into promo credit with its ORIGINAL expiry and
 * campaign, so a refund can never turn promo credit into uncapped refund credit or extend an
 * expiry. The wallet total is unchanged. Runs under the wallet lock the credit already holds.
 */
async function returnPromoPartOfRefund(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		orderId: string;
		walletId: string;
		refundAmount: number;
		balance: number;
		getShare: () => Promise<RefundShare>;
	}
): Promise<number> {
	const redemption = await tx.walletTransaction.findUnique({
		where: { reference: `${params.orderId}:promo` },
		select: {
			userId: true,
			type: true,
			amount: true,
			status: true,
			metadata: true,
			createdAt: true
		}
	});
	if (
		!redemption ||
		redemption.type !== SC_REDEEM_PROMO ||
		redemption.userId !== params.userId ||
		redemption.status !== 'available'
	) {
		return 0;
	}
	const promoSpent = naira(redemption.amount);
	if (promoSpent <= 0) return 0;

	const restoredRows = await tx.walletTransaction.findMany({
		where: {
			userId: params.userId,
			type: SC_CREDIT_PROMO,
			metadata: { path: ['restoredFromOrderId'], equals: params.orderId }
		},
		select: { amount: true, metadata: true }
	});
	// The promo share of everything refunded so far (whole naira); a full refund returns it all.
	const target = refundedPart(promoSpent, await params.getShare());
	const restoredByLot = new Map<string, number>();
	let alreadyRestored = 0;
	for (const row of restoredRows) {
		const amount = Math.max(0, Number(row.amount || 0));
		alreadyRestored += amount;
		const sourceLotId = metadataRecord(row.metadata).sourceLotId;
		if (typeof sourceLotId === 'string') {
			restoredByLot.set(sourceLotId, (restoredByLot.get(sourceLotId) ?? 0) + amount);
		}
	}
	let toRestore = Math.min(Math.floor(params.refundAmount), target - alreadyRestored);
	if (toRestore <= 0) return 0;

	const spentParts = promoDebitFromRow(redemption).lots ?? [];
	const sourceRows =
		spentParts.length > 0
			? await tx.walletTransaction.findMany({
					where: { id: { in: spentParts.map((part) => part.lotId) }, type: SC_CREDIT_PROMO },
					select: { id: true, amount: true, createdAt: true, metadata: true }
				})
			: [];
	const sourceLots = new Map(sourceRows.map((row) => [row.id, promoLotFromRow(row)]));
	// Return to the longest-lived credit first (kindest to the buyer, still never extended).
	const parts = spentParts
		.map((part) => ({ ...part, lot: sourceLots.get(part.lotId) }))
		.sort((a, b) => (b.lot?.expiresAt.getTime() ?? 0) - (a.lot?.expiresAt.getTime() ?? 0));

	const returns: Array<{
		sourceLotId: string | null;
		campaign: string;
		expiresAt: Date;
		amount: number;
	}> = [];
	for (const part of parts) {
		if (toRestore <= 0) break;
		const room = Math.floor(part.amount - (restoredByLot.get(part.lotId) ?? 0));
		const amount = Math.min(toRestore, Math.max(0, room));
		if (amount <= 0) continue;
		returns.push({
			sourceLotId: part.lotId,
			campaign: part.lot?.campaign ?? 'promo',
			expiresAt: part.lot?.expiresAt ?? redemption.createdAt,
			amount
		});
		toRestore -= amount;
	}
	if (toRestore > 0) {
		// Spend recorded without lot detail: return it as promo credit that expires with the order.
		returns.push({
			sourceLotId: null,
			campaign: 'promo',
			expiresAt: redemption.createdAt,
			amount: toRestore
		});
	}
	const total = returns.reduce((sum, entry) => sum + entry.amount, 0);
	if (total <= 0) return 0;

	const step = alreadyRestored + total;
	let balance = params.balance;
	await tx.walletTransaction.create({
		data: {
			walletId: params.walletId,
			userId: params.userId,
			type: SC_REFUND_TO_PROMO,
			amount: total,
			balanceBefore: balance,
			balanceAfter: balance - total,
			description: 'Part paid with promo credit, returned as promo credit',
			reference: `promo:refund-return:${params.orderId}:${step}`,
			status: 'available',
			metadata: { orderId: params.orderId, promoReturned: total }
		}
	});
	balance -= total;
	for (const entry of returns) {
		await tx.walletTransaction.create({
			data: {
				walletId: params.walletId,
				userId: params.userId,
				type: SC_CREDIT_PROMO,
				amount: entry.amount,
				balanceBefore: balance,
				balanceAfter: balance + entry.amount,
				description: `Promo credit returned from a refunded order · expires ${formatPromoExpiry(entry.expiresAt)}`,
				reference: `promo:refund-return:${params.orderId}:${step}:${entry.sourceLotId ?? 'unallocated'}`,
				status: 'available',
				metadata: {
					kind: 'promo_returned_after_refund',
					campaign: entry.campaign,
					expiresAt: entry.expiresAt.toISOString(),
					restoredFromOrderId: params.orderId,
					sourceLotId: entry.sourceLotId
				}
			}
		});
		balance += entry.amount;
	}
	return total;
}

export function formatPromoExpiry(at: Date): string {
	return at.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'Africa/Lagos'
	});
}

/**
 * Grant promo credit (one lot with its own campaign and expiry). Runs inside a caller transaction;
 * the reference makes it once-only. Returns false for an exact replay.
 */
export async function creditPromoCredit(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		amount: number;
		campaign: string;
		expiresAt: Date;
		description: string;
		reference: string;
		metadata?: Record<string, Prisma.InputJsonValue | null>;
	}
): Promise<boolean> {
	const amount = naira(params.amount);
	if (amount <= 0 || !params.reference) return false;
	const written = await writeLockedCredit(tx, {
		userId: params.userId,
		amount,
		type: SC_CREDIT_PROMO,
		description: params.description,
		reference: params.reference,
		metadata: {
			...(params.metadata ?? {}),
			campaign: params.campaign,
			expiresAt: params.expiresAt.toISOString()
		}
	});
	return written !== null;
}

/**
 * Close what is left of one promo lot (it expired, or the grant was reversed). Locks the wallet,
 * recomputes the lot from the ledger, and debits only the unspent remainder; spent credit is never
 * clawed back. Returns what was closed and what had already been spent.
 */
export async function closePromoLot(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		lotId: string;
		type: typeof SC_PROMO_EXPIRY | typeof SC_PROMO_REVERSAL;
		description: string;
		reference: string;
		metadata?: Record<string, Prisma.InputJsonValue | null>;
		requireExpired?: boolean;
		now?: Date;
	}
): Promise<{ closed: number; alreadySpent: number }> {
	const wallet = await tx.wallet.findUnique({
		where: { userId: params.userId },
		select: { id: true }
	});
	if (!wallet) return { closed: 0, alreadySpent: 0 };
	await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${params.userId}::uuid FOR UPDATE`;
	const existing = await tx.walletTransaction.findUnique({
		where: { reference: params.reference },
		select: { id: true }
	});
	if (existing) return { closed: 0, alreadySpent: 0 };

	const lot = (await getPromoLotBalances(params.userId, tx, params.now)).find(
		(entry) => entry.id === params.lotId
	);
	if (!lot || (params.requireExpired && !lot.expired)) return { closed: 0, alreadySpent: 0 };
	const closed = moneyNgn(lot.remaining);
	const alreadySpent = moneyNgn(Math.max(0, lot.amount - lot.remaining));
	if (closed <= 0) return { closed: 0, alreadySpent };

	const liveWallet = await tx.wallet.findUnique({
		where: { id: wallet.id },
		select: { balance: true }
	});
	if (!liveWallet) throw new Error('STORE_CREDIT_WALLET_NOT_FOUND');
	const balanceBefore = Number(liveWallet.balance || 0);
	await tx.wallet.update({
		where: { id: wallet.id },
		data: { balance: balanceBefore - closed }
	});
	await tx.walletTransaction.create({
		data: {
			walletId: wallet.id,
			userId: params.userId,
			type: params.type,
			amount: closed,
			balanceBefore,
			balanceAfter: balanceBefore - closed,
			description: params.description,
			reference: params.reference,
			status: 'available',
			metadata: { ...(params.metadata ?? {}), lotId: params.lotId, campaign: lot.campaign }
		}
	});
	return { closed, alreadySpent };
}

/** Debit store credit for an order redemption (one row per bucket used). */
export async function redeemStoreCreditForOrder(
	tx: Prisma.TransactionClient,
	params: {
		userId: string;
		orderId: string;
		orderNumber: string;
		redemption: OrderRedemption;
		/** Order total after discounts and the campaign caps, so promo lots respect each cap. */
		orderTotal?: number;
		promoCaps?: Readonly<Record<string, number>>;
	}
): Promise<void> {
	const { refundApplied, earnedApplied } = params.redemption;
	const promoApplied = naira(params.redemption.promoApplied);
	if (refundApplied <= 0 && earnedApplied <= 0 && promoApplied <= 0) return;

	const wallet = await tx.wallet.upsert({
		where: { userId: params.userId },
		update: { balance: { increment: 0 } },
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

	// Promo spend is recorded against specific lots (earliest expiry first, each campaign within
	// its cap) so refunds can return it with the same expiry and reports stay per campaign.
	let promoLots: Array<{ lotId: string; amount: number }> = [];
	if (promoApplied > 0) {
		promoLots = allocatePromoSpend(await getPromoLotBalances(params.userId, tx), promoApplied, {
			orderTotal: params.orderTotal,
			caps: params.promoCaps
		});
		if (promoLots.reduce((sum, part) => sum + part.amount, 0) !== promoApplied) {
			throw new Error('INSUFFICIENT_STORE_CREDIT');
		}
	}

	let balance = Number(liveWallet.balance || 0);

	const rows: Array<{
		type: string;
		amount: number;
		bucket: string;
		lots?: Array<{ lotId: string; amount: number }>;
	}> = [];
	if (promoApplied > 0)
		rows.push({ type: SC_REDEEM_PROMO, amount: promoApplied, bucket: 'promo', lots: promoLots });
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
				metadata: {
					orderId: params.orderId,
					bucket: row.bucket,
					...(row.lots ? { lots: row.lots } : {})
				}
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
			type: { in: [SC_REDEEM_EARNED, SC_REDEEM_REFUND, SC_REDEEM_PROMO] },
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
	const expectedAmount = moneyNgn(params.expectedAmount);
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
			type: { in: [SC_REDEEM_EARNED, SC_REDEEM_REFUND, SC_REDEEM_PROMO] }
		},
		select: { id: true, type: true, amount: true, status: true, metadata: true, createdAt: true }
	});
	const supported = debits.filter((row) => ['available', 'reversed'].includes(row.status));
	const recordedAmount = supported.reduce(
		(sum, row) => sum + Math.max(0, Number(row.amount || 0)),
		0
	);
	if (supported.length !== debits.length || Math.abs(recordedAmount - expectedAmount) > 0.005) {
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
	const promoApplied = reversed
		.filter((row) => row.type === SC_REDEEM_PROMO)
		.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
	const liveBuckets = await getStoreCreditBuckets(params.userId, tx);
	if (redemptionExceedsAvailable({ refundApplied, earnedApplied }, liveBuckets)) {
		throw new Error('STORE_CREDIT_LATE_PAYMENT_INSUFFICIENT');
	}
	if (promoApplied > 0) {
		// The same lots must still hold the credit (not spent elsewhere or closed by expiry since).
		const remaining = new Map(
			(await getPromoLotBalances(params.userId, tx)).map((lot) => [lot.id, lot.remaining])
		);
		for (const row of reversed.filter((entry) => entry.type === SC_REDEEM_PROMO)) {
			const parts = promoDebitFromRow(row).lots ?? [];
			const covered = parts.reduce((sum, part) => sum + part.amount, 0);
			if (
				Math.abs(covered - Math.max(0, Number(row.amount || 0))) > 0.005 ||
				parts.some((part) => (remaining.get(part.lotId) ?? 0) + 0.005 < part.amount)
			) {
				throw new Error('STORE_CREDIT_LATE_PAYMENT_INSUFFICIENT');
			}
		}
	}

	const liveWallet = await tx.wallet.findUnique({
		where: { id: wallet.id },
		select: { balance: true }
	});
	const restoredAmount = refundApplied + earnedApplied + promoApplied;
	if (!liveWallet || Number(liveWallet.balance || 0) + 0.005 < restoredAmount) {
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
