import { prisma } from '$lib/prisma';

// Affiliate rewards VEST before they become usable: a reward is recorded as `pending`
// (not counted toward the spendable or withdrawable balance) and only flips to
// `available` after the refund window passes AND the order hasn't been refunded. A
// refund inside the window simply voids the pending reward — nothing to claw back.

const REWARD_VESTING_DAYS_KEY = 'config.affiliate.reward_vesting_days';
export const DEFAULT_REWARD_VESTING_DAYS = 14;
// An order in any of these states means its reward must not vest (void it instead).
const REFUNDED_ORDER_STATUSES = new Set(['refunded', 'cancelled', 'failed', 'expired']);

export async function getRewardVestingDays(): Promise<number> {
	const row = await prisma.microcopy
		.findFirst({ where: { key: REWARD_VESTING_DAYS_KEY }, select: { value: true } })
		.catch(() => null);
	const n = Number(row?.value);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_REWARD_VESTING_DAYS;
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
			.findFirst({ where: { userId: affiliateUserId }, select: { accountNumber: true, bankName: true } })
			.catch(() => null),
		prisma.affiliatePayoutDetails
			.findFirst({ where: { userId: buyerUserId }, select: { accountNumber: true, bankName: true } })
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
	await prisma.walletTransaction.updateMany({
		where: { id: { in: pending.map((p) => p.id) } },
		data: { status: 'reversed' }
	});
	return { voided: pending.length };
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
		select: { id: true, amount: true, walletId: true }
	});
	for (const row of rows) {
		await prisma.$transaction(async (tx) => {
			const w = await tx.wallet.findUnique({
				where: { id: row.walletId },
				select: { balance: true }
			});
			const before = Number(w?.balance || 0);
			await tx.wallet.update({
				where: { id: row.walletId },
				data: { balance: Math.max(0, before - Number(row.amount || 0)) }
			});
			await tx.walletTransaction.update({ where: { id: row.id }, data: { status: 'reversed' } });
		});
	}
	return { reversed: rows.length };
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
				select: { status: true, paymentStatus: true }
			});
			const refunded =
				order &&
				(REFUNDED_ORDER_STATUSES.has(order.status) ||
					REFUNDED_ORDER_STATUSES.has(order.paymentStatus));
			if (refunded) {
				await prisma.walletTransaction.update({
					where: { id: row.id },
					data: { status: 'reversed' }
				});
				voided += 1;
				continue;
			}
		}

		// Matured + order still good → vest: flip to available and credit the balance now.
		await prisma.$transaction(async (tx) => {
			const w = await tx.wallet.findUnique({
				where: { id: row.walletId },
				select: { balance: true }
			});
			const before = Number(w?.balance || 0);
			await tx.wallet.update({
				where: { id: row.walletId },
				data: { balance: before + Number(row.amount || 0) }
			});
			await tx.walletTransaction.update({
				where: { id: row.id },
				data: {
					status: 'available',
					metadata: { ...meta, lifecycleStatus: 'available', vestedAt: nowIso }
				}
			});
		});
		vested += 1;
	}

	return { vested, voided, skipped };
}
