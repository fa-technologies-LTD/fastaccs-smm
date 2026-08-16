import { prisma } from '$lib/prisma';
import { creditStoreCredit, getStoreCreditBuckets, SC_CREDIT_GIFT } from '$lib/services/store-credit';

/**
 * Spend-milestone rewards (buyer-facing, driven by lifetime paid spend):
 *  - ₦8,000 spent  → a single-use ₦1,000 promo code (min ₦2,000 order, 30-day expiry)
 *  - ₦70,000 spent → a ₦3,000 store-credit gift (spendable, not cashable)
 * Each is granted once per user (idempotent). Best-effort; never blocks fulfilment.
 */
export const PROMO_MILESTONE_SPEND = 8000;
export const PROMO_MILESTONE_REWARD = 1000;
export const PROMO_MIN_ORDER = 2000;
export const PROMO_EXPIRY_DAYS = 30;
export const GIFT_MILESTONE_SPEND = 70000;
export const GIFT_MILESTONE_REWARD = 3000;

const PROMO_CODE_PREFIX = 'SPEND8K-';
const GIFT_REFERENCE = (userId: string) => `spend:gift:70k:${userId}`;

async function cumulativePaidSpend(userId: string): Promise<number> {
	const agg = await prisma.order.aggregate({
		where: {
			userId,
			OR: [{ status: { in: ['paid', 'completed'] } }, { paymentStatus: 'paid' }]
		},
		_sum: { totalAmount: true }
	});
	return Number(agg._sum.totalAmount || 0);
}

function generatePromoCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
	let suffix = '';
	for (let i = 0; i < 6; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
	return `${PROMO_CODE_PREFIX}${suffix}`;
}

/** Called after every paid order (via recoverPaidOrder). Idempotent + best-effort. */
export async function maybeGrantSpendMilestones(userId: string | null | undefined): Promise<void> {
	if (!userId) return;
	try {
		const spend = await cumulativePaidSpend(userId);
		if (spend >= GIFT_MILESTONE_SPEND) await maybeGrantSpendGift(userId);
		if (spend >= PROMO_MILESTONE_SPEND) await maybeGrantSpendPromo(userId);
	} catch (error) {
		console.error('maybeGrantSpendMilestones failed:', error);
	}
}

async function maybeGrantSpendGift(userId: string): Promise<void> {
	const reference = GIFT_REFERENCE(userId);
	const existing = await prisma.walletTransaction.findUnique({
		where: { reference },
		select: { id: true }
	});
	if (existing) return;
	try {
		await prisma.$transaction((tx) =>
			creditStoreCredit(tx, {
				userId,
				amount: GIFT_MILESTONE_REWARD,
				type: SC_CREDIT_GIFT,
				description: '₦3,000 gift for reaching ₦70,000 spent',
				reference,
				metadata: { kind: 'spend_gift_70k' }
			})
		);
	} catch (error) {
		if ((error as { code?: string })?.code === 'P2002') return; // concurrent grant
		throw error;
	}
	await prisma.notification
		.create({
			data: {
				userId,
				type: 'store_credit_gift',
				title: 'You earned a ₦3,000 gift 🎁',
				message: `Thanks for reaching ₦70,000 in orders — ₦3,000 store credit is on your balance.`
			}
		})
		.catch(() => {});
}

async function maybeGrantSpendPromo(userId: string): Promise<void> {
	const existing = await prisma.promotionCode.findFirst({
		where: { issuedToUserId: userId, code: { startsWith: PROMO_CODE_PREFIX } },
		select: { id: true }
	});
	if (existing) return;

	const code = generatePromoCode();
	try {
		await prisma.promotionCode.create({
			data: {
				code,
				type: 'FIXED',
				value: PROMO_MILESTONE_REWARD,
				currency: 'NGN',
				minOrderValue: PROMO_MIN_ORDER,
				usageCap: 1,
				singleUsePerUser: true,
				isActive: true,
				issuedToUserId: userId,
				platformIds: [],
				endsAt: new Date(Date.now() + PROMO_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
			}
		});
	} catch (error) {
		if ((error as { code?: string })?.code === 'P2002') return; // code/collision
		throw error;
	}
	await prisma.notification
		.create({
			data: {
				userId,
				type: 'promotion',
				title: 'You unlocked a ₦1,000 promo 🎉',
				message: `Use code ${code} for ₦1,000 off your next order (min ₦2,000). Expires in ${PROMO_EXPIRY_DAYS} days.`
			}
		})
		.catch(() => {});
}

/**
 * Called after a refund. If it drops the buyer back below a milestone AND the
 * reward is still unspent/unused, reverse it (gift) or deactivate it (promo).
 * Never claws back a gift the buyer has already spent, or a redeemed promo.
 */
export async function maybeClawbackSpendMilestones(userId: string | null | undefined): Promise<void> {
	if (!userId) return;
	try {
		const spend = await cumulativePaidSpend(userId);
		if (spend < GIFT_MILESTONE_SPEND) await maybeClawbackGift(userId);
		if (spend < PROMO_MILESTONE_SPEND) await deactivateUnusedPromo(userId);
	} catch (error) {
		console.error('maybeClawbackSpendMilestones failed:', error);
	}
}

async function maybeClawbackGift(userId: string): Promise<void> {
	const gift = await prisma.walletTransaction.findUnique({
		where: { reference: GIFT_REFERENCE(userId) },
		select: { id: true, amount: true, status: true }
	});
	if (!gift || gift.status !== 'available') return; // no gift, or already reversed
	const amount = Math.max(0, Number(gift.amount || 0));
	// "Unspent" = the earned bucket still holds at least the gift amount.
	const buckets = await getStoreCreditBuckets(userId);
	if (buckets.earnedAvailable < amount) return; // spent down — keep it

	await prisma.$transaction(async (tx) => {
		const wallet = await tx.wallet.findUnique({
			where: { userId },
			select: { id: true }
		});
		if (!wallet) return;
		await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
		const liveGift = await tx.walletTransaction.findUnique({
			where: { id: gift.id },
			select: { status: true, amount: true }
		});
		if (liveGift?.status !== 'available') return;
		const liveBuckets = await getStoreCreditBuckets(userId, tx);
		const liveAmount = Math.max(0, Number(liveGift.amount || 0));
		if (liveBuckets.earnedAvailable < liveAmount) return;

		await tx.walletTransaction.update({ where: { id: gift.id }, data: { status: 'reversed' } });
		const liveWallet = await tx.wallet.findUnique({
			where: { id: wallet.id },
			select: { balance: true }
		});
		if (!liveWallet) return;
		await tx.wallet.update({
			where: { id: wallet.id },
			data: { balance: Math.max(0, Number(liveWallet.balance || 0) - liveAmount) }
		});
		await tx.notification.create({
			data: {
				userId,
				type: 'store_credit_gift',
				title: 'Gift reversed',
				message: `A refund brought you below ₦70,000, so the unspent ₦${amount.toLocaleString()} gift was reversed.`
			}
		});
	});
}

async function deactivateUnusedPromo(userId: string): Promise<void> {
	const promo = await prisma.promotionCode.findFirst({
		where: {
			issuedToUserId: userId,
			code: { startsWith: PROMO_CODE_PREFIX },
			isActive: true,
			usageCount: 0
		},
		select: { id: true }
	});
	if (!promo) return;
	const redeemed = await prisma.promotionRedemption.count({ where: { promotionId: promo.id } });
	if (redeemed > 0) return; // already used — leave it
	await prisma.promotionCode.update({ where: { id: promo.id }, data: { isActive: false } });
	await prisma.notification
		.create({
			data: {
				userId,
				type: 'promotion',
				title: 'Promo no longer available',
				message: 'A refund brought you below the ₦8,000 threshold, so your ₦1,000 promo was withdrawn.'
			}
		})
		.catch(() => {});
}
