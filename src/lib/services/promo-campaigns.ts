import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere, toNetSales } from '$lib/helpers/order-revenue.server';
import { parseTierUnitCost } from '$lib/helpers/tier-unit-cost';
import { TIER_DELIVERY_MODE_KEY } from '$lib/helpers/tier-delivery-config';
import { createAdminAuditLog } from '$lib/services/admin-audit';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import { detectAffiliateIdentityRiskSignals } from '$lib/services/affiliate-vesting';
import { goodsCostFromOrderMetadata } from '$lib/services/super-affiliate-terms';
import {
	closePromoLot,
	creditPromoCredit,
	formatPromoExpiry,
	getAllPromoLotBalances,
	SC_CREDIT_PROMO,
	SC_PROMO_EXPIRY,
	SC_PROMO_REVERSAL,
	SC_REDEEM_PROMO
} from '$lib/services/store-credit';
import {
	BIGSPENDER_KEY,
	REFER_WIN_KEY,
	isCampaignLive,
	keptCash,
	lagosMonthStart,
	nextLagosMonthStart,
	parseBigSpenderSettings,
	parseReferWinSettings,
	referWinMarginCheck,
	referWinProgress,
	totalKeptCash,
	type BigSpenderSettings,
	type CampaignKind,
	type FriendOrder,
	type ReferWinSettings,
	type TierMargin
} from '$lib/helpers/promo-campaign-rules';

/**
 * Refer & Win and BIGSPENDER, built on the promo credit bucket. Both are OFF until the owner
 * switches them on from Admin → Campaigns; nothing here grants credit while a campaign is off,
 * and nothing here sends email unless BIGSPENDER reminders are separately switched on.
 */

const DAY_MS = 86_400_000;
const REFER_WIN_REFERENCE = (friendUserId: string) => `refer_win:${friendUserId}`;
const BIGSPENDER_REFERENCE = (userId: string) => `bigspender:${userId}`;
const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

type Db = typeof prisma | Prisma.TransactionClient;

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export async function getCampaignSettings(
	db: Db = prisma
): Promise<{ referWin: ReferWinSettings; bigSpender: BigSpenderSettings }> {
	const rows = await db.microcopy.findMany({
		where: { key: { in: [REFER_WIN_KEY, BIGSPENDER_KEY] } },
		select: { key: true, value: true }
	});
	const byKey = new Map(rows.map((row) => [row.key, row.value]));
	return {
		referWin: parseReferWinSettings(byKey.get(REFER_WIN_KEY)),
		bigSpender: parseBigSpenderSettings(byKey.get(BIGSPENDER_KEY))
	};
}

/** Checkout caps per campaign (applies to credit already issued even if a campaign is later off). */
export async function getPromoCaps(db: Db = prisma): Promise<Record<string, number>> {
	const { referWin, bigSpender } = await getCampaignSettings(db);
	return { refer_win: referWin.capPercent, bigspender: bigSpender.capPercent };
}

export async function saveCampaignSettings(params: {
	kind: CampaignKind;
	settings: ReferWinSettings | BigSpenderSettings;
	before: ReferWinSettings | BigSpenderSettings;
	actorUserId: string;
	description: string;
}): Promise<void> {
	const key = params.kind === 'refer_win' ? REFER_WIN_KEY : BIGSPENDER_KEY;
	const value = JSON.stringify({
		...params.settings,
		updatedAt: new Date().toISOString(),
		updatedBy: params.actorUserId
	});
	await prisma.$transaction(async (tx) => {
		await tx.microcopy.upsert({
			where: { key },
			create: {
				key,
				value,
				category: 'settings',
				description: `${params.kind === 'refer_win' ? 'Refer & Win' : 'BIGSPENDER'} campaign settings (edit from Admin → Campaigns only)`,
				isActive: true
			},
			update: { value, updatedAt: new Date() }
		});
		await createAdminAuditLog(
			{
				actorUserId: params.actorUserId,
				action: `campaign_${params.kind}_settings_changed`,
				resourceType: 'promo_campaign',
				resourceId: params.kind,
				description: params.description,
				metadata: {
					before: params.before as unknown as Prisma.InputJsonValue,
					after: JSON.parse(value)
				},
				required: true
			},
			tx
		);
	});
}

// ---------------------------------------------------------------------------------------------
// Margin gate (Refer & Win)
// ---------------------------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Active, priced ACCOUNT tiers (instant or manual handover) with their price and cost. */
export async function loadAccountTierMargins(): Promise<TierMargin[]> {
	const tiers = await prisma.category.findMany({
		where: { categoryType: 'tier', isActive: true },
		select: { name: true, metadata: true, parent: { select: { name: true } } }
	});
	return tiers
		.map((tier) => {
			const metadata = record(tier.metadata);
			const mode = String(metadata[TIER_DELIVERY_MODE_KEY] || 'instant_auto');
			const pricing = record(metadata.pricing);
			const price = Number(pricing.base_price ?? metadata.price ?? 0);
			return {
				mode,
				name: tier.parent?.name ? `${tier.parent.name} · ${tier.name}` : tier.name,
				priceNgn: Number.isFinite(price) ? price : 0,
				unitCostNgn: parseTierUnitCost(metadata)
			};
		})
		.filter((tier) => ['instant_auto', 'manual_handover'].includes(tier.mode) && tier.priceNgn > 0)
		.map(({ name, priceNgn, unitCostNgn }) => ({ name, priceNgn, unitCostNgn }));
}

export async function getReferWinMarginCheck(settings: ReferWinSettings) {
	return referWinMarginCheck(await loadAccountTierMargins(), settings);
}

// ---------------------------------------------------------------------------------------------
// Refer & Win
// ---------------------------------------------------------------------------------------------

export type ReferWinStatus =
	| 'issue'
	| 'issued'
	| 'waiting'
	| 'not_yet'
	| 'monthly_limit'
	| 'held_identity'
	| 'super_excluded';

export interface ReferWinDecision {
	referrerUserId: string;
	referrerEmail: string | null;
	friendUserId: string;
	friendEmail: string | null;
	isSuperReferrer: boolean;
	status: ReferWinStatus;
	settledCash: number;
	pendingCash: number;
	amount: number;
	/** When it was/would be issued (for waiting/limit: the earliest possible time). */
	when: Date | null;
	triggerOrderId: string | null;
	signals: string[];
}

function friendOrderFrom(order: {
	id: string;
	totalAmount: unknown;
	storeCreditApplied: unknown;
	refundedAmount: unknown;
	paidAt: Date | null;
	createdAt: Date;
	deliveredAt: Date | null;
	updatedAt: Date;
	deliveryStatus: string;
	status: string;
}): FriendOrder {
	const delivered = order.deliveryStatus === 'delivered' || order.status === 'completed';
	return {
		id: order.id,
		totalAmount: Number(order.totalAmount || 0),
		storeCreditApplied: Number(order.storeCreditApplied || 0),
		refundedAmount: Number(order.refundedAmount || 0),
		paidAt: order.paidAt ?? order.createdAt,
		delivered,
		deliveredAt: delivered ? (order.deliveredAt ?? order.updatedAt) : null
	};
}

const FRIEND_ORDER_SELECT = {
	id: true,
	userId: true,
	totalAmount: true,
	storeCreditApplied: true,
	refundedAmount: true,
	paidAt: true,
	createdAt: true,
	deliveredAt: true,
	updatedAt: true,
	deliveryStatus: true,
	status: true
} as const;

async function loadFriendOrders(friendIds: string[]): Promise<Map<string, FriendOrder[]>> {
	const result = new Map<string, FriendOrder[]>();
	if (friendIds.length === 0) return result;
	const orders = await prisma.order.findMany({
		where: { AND: [buildRevenueOrderWhere(), { userId: { in: friendIds } }] },
		select: FRIEND_ORDER_SELECT
	});
	for (const order of orders) {
		if (!order.userId) continue;
		result.set(order.userId, [...(result.get(order.userId) ?? []), friendOrderFrom(order)]);
	}
	return result;
}

/**
 * Who would get Refer & Win credit, how much and when. `launchForwardFrom` limits it to friends
 * referred from that moment (the live rule: no backfill). `illustrateExisting` ignores that limit
 * to size the campaign against today's referrals (dry run only; never used to issue).
 */
export async function evaluateReferWin(options: {
	settings: ReferWinSettings;
	now?: Date;
	launchForwardFrom: Date | null;
	illustrateExisting?: boolean;
}): Promise<ReferWinDecision[]> {
	const now = options.now ?? new Date();
	const { settings } = options;
	// Live rule: only friends referred from launch. Before launch nobody qualifies.
	if (!options.illustrateExisting && !options.launchForwardFrom) return [];
	const referrals = await prisma.affiliateReferral.findMany({
		where: {
			status: 'active',
			...(options.illustrateExisting ? {} : { lockedAt: { gte: options.launchForwardFrom! } })
		},
		select: {
			referrerUserId: true,
			referredUserId: true,
			referrer: { select: { email: true } },
			referredUser: { select: { email: true } },
			program: { select: { isSuperAffiliate: true } }
		}
	});
	if (referrals.length === 0) return [];

	const friendIds = referrals.map((referral) => referral.referredUserId);
	const [ordersByFriend, grants, monthGrants] = await Promise.all([
		loadFriendOrders(friendIds),
		prisma.walletTransaction.findMany({
			where: { reference: { in: friendIds.map(REFER_WIN_REFERENCE) } },
			select: { reference: true, createdAt: true, amount: true }
		}),
		prisma.walletTransaction.findMany({
			where: {
				type: SC_CREDIT_PROMO,
				reference: { startsWith: 'refer_win:' },
				createdAt: { gte: lagosMonthStart(now) }
			},
			select: { userId: true }
		})
	]);
	const grantByReference = new Map(grants.map((grant) => [grant.reference, grant]));
	const issuedThisMonth = new Map<string, number>();
	for (const row of monthGrants) {
		if (row.userId) issuedThisMonth.set(row.userId, (issuedThisMonth.get(row.userId) ?? 0) + 1);
	}

	const decisions: ReferWinDecision[] = [];
	for (const referral of referrals) {
		const base = {
			referrerUserId: referral.referrerUserId,
			referrerEmail: referral.referrer?.email ?? null,
			friendUserId: referral.referredUserId,
			friendEmail: referral.referredUser?.email ?? null,
			isSuperReferrer: Boolean(referral.program?.isSuperAffiliate),
			amount: settings.rewardNgn,
			signals: [] as string[]
		};
		const grant = grantByReference.get(REFER_WIN_REFERENCE(referral.referredUserId));
		const orders = ordersByFriend.get(referral.referredUserId) ?? [];
		if (grant) {
			decisions.push({
				...base,
				amount: Number(grant.amount),
				status: 'issued',
				settledCash: totalKeptCash(orders),
				pendingCash: 0,
				when: grant.createdAt,
				triggerOrderId: null
			});
			continue;
		}
		const progress = referWinProgress(orders, settings, now);
		if (progress.status !== 'ready') {
			decisions.push({
				...base,
				status: progress.status,
				settledCash: progress.settledCash,
				pendingCash: progress.pendingCash,
				when: progress.status === 'waiting' ? progress.readyAt : null,
				triggerOrderId: null
			});
			continue;
		}
		decisions.push({
			...base,
			status: base.isSuperReferrer && !settings.includeSuper ? 'super_excluded' : 'issue',
			settledCash: progress.settledCash,
			pendingCash: 0,
			when: now,
			triggerOrderId: progress.triggerOrderId
		});
	}

	// Identity checks, then the monthly limit (earliest qualifier first within each referrer).
	for (const decision of decisions.filter((entry) => entry.status === 'issue')) {
		decision.signals = await detectAffiliateIdentityRiskSignals(
			decision.referrerUserId,
			decision.friendUserId
		);
		if (decision.signals.length > 0) decision.status = 'held_identity';
	}
	for (const decision of decisions.filter((entry) => entry.status === 'issue')) {
		const used = issuedThisMonth.get(decision.referrerUserId) ?? 0;
		if (used >= settings.monthlyLimit) {
			decision.status = 'monthly_limit';
			decision.when = nextLagosMonthStart(now);
		} else {
			issuedThisMonth.set(decision.referrerUserId, used + 1);
		}
	}
	return decisions;
}

async function issueReferWinCredit(
	decision: ReferWinDecision,
	settings: ReferWinSettings,
	now: Date,
	extra: Record<string, Prisma.InputJsonValue | null> = {}
): Promise<boolean> {
	const expiresAt = new Date(now.getTime() + settings.expiryDays * DAY_MS);
	const created = await prisma.$transaction((tx) =>
		creditPromoCredit(tx, {
			userId: decision.referrerUserId,
			amount: settings.rewardNgn,
			campaign: 'refer_win',
			expiresAt,
			description: `Refer & Win: a friend you referred reached ${naira(settings.qualifyingCashNgn)} · expires ${formatPromoExpiry(expiresAt)}`,
			reference: REFER_WIN_REFERENCE(decision.friendUserId),
			metadata: {
				kind: 'refer_win',
				referrerUserId: decision.referrerUserId,
				friendUserId: decision.friendUserId,
				triggerOrderId: decision.triggerOrderId,
				qualifyingCashNgn: settings.qualifyingCashNgn,
				...extra
			}
		})
	);
	if (!created) return false;
	await recordAffiliateEvent({
		type: 'refer_win_issued',
		dedupeKey: REFER_WIN_REFERENCE(decision.friendUserId),
		affiliateUserId: decision.referrerUserId,
		referredUserId: decision.friendUserId,
		orderId: decision.triggerOrderId,
		source: 'promo_campaign',
		metadata: { amount: settings.rewardNgn, expiresAt: expiresAt.toISOString(), ...extra }
	}).catch(() => {});
	await prisma.notification
		.create({
			data: {
				userId: decision.referrerUserId,
				type: 'store_credit_gift',
				title: `You earned ${naira(settings.rewardNgn)} store credit`,
				message: `A friend you referred reached ${naira(settings.qualifyingCashNgn)} in orders. Your ${naira(settings.rewardNgn)} store credit is ready to spend until ${formatPromoExpiry(expiresAt)}.`
			}
		})
		.catch(() => {});
	return true;
}

/** Cron: issue every Refer & Win reward that is due. Does nothing while the campaign is off. */
export async function runReferWinIssuance(now: Date = new Date()): Promise<{
	live: boolean;
	issued: number;
	held: number;
	limited: number;
}> {
	const { referWin } = await getCampaignSettings();
	if (!isCampaignLive(referWin, now)) return { live: false, issued: 0, held: 0, limited: 0 };
	const decisions = await evaluateReferWin({
		settings: referWin,
		now,
		launchForwardFrom: new Date(referWin.startsAt!)
	});
	let issued = 0;
	for (const decision of decisions.filter((entry) => entry.status === 'issue')) {
		if (await issueReferWinCredit(decision, referWin, now)) issued += 1;
	}
	return {
		live: true,
		issued,
		held: decisions.filter((entry) => entry.status === 'held_identity').length,
		limited: decisions.filter((entry) => entry.status === 'monthly_limit').length
	};
}

/** Owner releases one reward held by the identity check (still subject to the monthly limit). */
export async function releaseHeldReferWin(params: {
	friendUserId: string;
	actorUserId: string;
}): Promise<{ success: boolean; error?: string }> {
	const { referWin } = await getCampaignSettings();
	const now = new Date();
	if (!isCampaignLive(referWin, now)) return { success: false, error: 'Refer & Win is off.' };
	const decision = (
		await evaluateReferWin({
			settings: referWin,
			now,
			launchForwardFrom: new Date(referWin.startsAt!)
		})
	).find((entry) => entry.friendUserId === params.friendUserId);
	if (!decision || decision.status !== 'held_identity') {
		return { success: false, error: 'This reward is not waiting for an identity review.' };
	}
	const used = await prisma.walletTransaction.count({
		where: {
			userId: decision.referrerUserId,
			type: SC_CREDIT_PROMO,
			reference: { startsWith: 'refer_win:' },
			createdAt: { gte: lagosMonthStart(now) }
		}
	});
	if (used >= referWin.monthlyLimit) {
		return { success: false, error: 'This referrer has reached this month’s limit.' };
	}
	const created = await issueReferWinCredit(decision, referWin, now, {
		identityReleasedBy: params.actorUserId,
		identityRiskSignals: decision.signals
	});
	if (created) {
		await createAdminAuditLog({
			actorUserId: params.actorUserId,
			targetUserId: decision.referrerUserId,
			action: 'refer_win_identity_released',
			resourceType: 'promo_campaign',
			resourceId: 'refer_win',
			description: `Released a held Refer & Win reward (${decision.signals.join(', ')})`,
			metadata: { friendUserId: decision.friendUserId, amount: referWin.rewardNgn }
		});
	}
	return created ? { success: true } : { success: false, error: 'Already issued.' };
}

/**
 * After a refund: if the friend's kept cash fell below the threshold, remove whatever is left of
 * the referrer's reward. Spent credit is never clawed back; it is logged instead.
 */
export async function reconcileReferWinForFriend(friendUserId: string): Promise<void> {
	const grant = await prisma.walletTransaction.findUnique({
		where: { reference: REFER_WIN_REFERENCE(friendUserId) },
		select: { id: true, userId: true, status: true, metadata: true }
	});
	if (!grant?.userId || grant.status !== 'available') return;
	const qualifying = Number(record(grant.metadata).qualifyingCashNgn) || 0;
	const orders = (await loadFriendOrders([friendUserId])).get(friendUserId) ?? [];
	const kept = totalKeptCash(orders);
	if (kept >= qualifying) return;
	const result = await prisma.$transaction((tx) =>
		closePromoLot(tx, {
			userId: grant.userId!,
			lotId: grant.id,
			type: SC_PROMO_REVERSAL,
			description: 'Refer & Win credit removed: your friend’s qualifying order was refunded',
			reference: `refer_win:reversal:${friendUserId}`,
			metadata: { kind: 'refer_win_reversal', friendUserId, friendKeptCash: kept }
		})
	);
	await recordAffiliateEvent({
		type: result.alreadySpent > 0 ? 'refer_win_refunded_after_spend' : 'refer_win_reversed',
		dedupeKey: `refer_win:reversal:${friendUserId}`,
		affiliateUserId: grant.userId,
		referredUserId: friendUserId,
		source: 'refund',
		metadata: {
			reversed: result.closed,
			alreadySpentNotClawedBack: result.alreadySpent,
			friendKeptCash: kept
		}
	}).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// BIGSPENDER
// ---------------------------------------------------------------------------------------------

async function lifetimeSpend(userId: string, before?: Date): Promise<number> {
	const agg = await prisma.order.aggregate({
		where: {
			AND: [
				buildRevenueOrderWhere(),
				{ userId },
				...(before
					? [{ OR: [{ paidAt: { lt: before } }, { paidAt: null, createdAt: { lt: before } }] }]
					: [])
			]
		},
		_sum: { totalAmount: true, refundedAmount: true }
	});
	return toNetSales(agg._sum.totalAmount, agg._sum.refundedAmount);
}

async function grantBigSpender(
	userId: string,
	settings: BigSpenderSettings,
	now: Date,
	extra: Record<string, Prisma.InputJsonValue | null>
): Promise<boolean> {
	const expiresAt = new Date(now.getTime() + settings.expiryDays * DAY_MS);
	const created = await prisma.$transaction((tx) =>
		creditPromoCredit(tx, {
			userId,
			amount: settings.rewardNgn,
			campaign: 'bigspender',
			expiresAt,
			description: `BIGSPENDER: thank you for spending over ${naira(settings.thresholdNgn)} · expires ${formatPromoExpiry(expiresAt)}`,
			reference: BIGSPENDER_REFERENCE(userId),
			metadata: { kind: 'bigspender', thresholdNgn: settings.thresholdNgn, ...extra }
		})
	);
	if (!created) return false;
	await prisma.notification
		.create({
			data: {
				userId,
				type: 'store_credit_gift',
				title: `${naira(settings.rewardNgn)} store credit for you`,
				message: `Thank you for spending over ${naira(settings.thresholdNgn)} with us. Your ${naira(settings.rewardNgn)} store credit is ready to spend until ${formatPromoExpiry(expiresAt)}.`
			}
		})
		.catch(() => {});
	return true;
}

/**
 * After every paid order: grant BIGSPENDER the moment a customer crosses the threshold, if they
 * crossed it after launch. Customers who were already over it at launch are only granted by the
 * owner's one-off action (after its dry run). Best-effort; never blocks fulfilment.
 */
export async function maybeGrantBigSpender(userId: string, spend: number): Promise<void> {
	const { bigSpender } = await getCampaignSettings();
	const now = new Date();
	if (!isCampaignLive(bigSpender, now) || spend < bigSpender.thresholdNgn) return;
	const existing = await prisma.walletTransaction.findUnique({
		where: { reference: BIGSPENDER_REFERENCE(userId) },
		select: { id: true }
	});
	if (existing) return;
	const spendAtLaunch = await lifetimeSpend(userId, new Date(bigSpender.startsAt!));
	if (spendAtLaunch >= bigSpender.thresholdNgn) return;
	await grantBigSpender(userId, bigSpender, now, { crossedAfterLaunch: true });
}

/** After a refund: if lifetime spend fell back below the threshold, remove the unspent credit. */
export async function reconcileBigSpender(userId: string, spend: number): Promise<void> {
	const grant = await prisma.walletTransaction.findUnique({
		where: { reference: BIGSPENDER_REFERENCE(userId) },
		select: { id: true, status: true, metadata: true }
	});
	if (!grant || grant.status !== 'available') return;
	const threshold = Number(record(grant.metadata).thresholdNgn) || 0;
	if (spend >= threshold) return;
	const result = await prisma.$transaction((tx) =>
		closePromoLot(tx, {
			userId,
			lotId: grant.id,
			type: SC_PROMO_REVERSAL,
			description: 'BIGSPENDER credit removed after a refund brought spend below the threshold',
			reference: `bigspender:reversal:${userId}`,
			metadata: { kind: 'bigspender_reversal', lifetimeSpend: spend }
		})
	);
	await recordAffiliateEvent({
		type: result.alreadySpent > 0 ? 'bigspender_refunded_after_spend' : 'bigspender_reversed',
		dedupeKey: `bigspender:reversal:${userId}`,
		referredUserId: userId,
		source: 'refund',
		metadata: {
			reversed: result.closed,
			alreadySpentNotClawedBack: result.alreadySpent,
			lifetimeSpend: spend
		}
	}).catch(() => {});
}

export interface BigSpenderQualifier {
	userId: string;
	email: string | null;
	name: string | null;
	lifetimeSpend: number;
	hadSpendGift70k: boolean;
	alreadyGranted: boolean;
}

/** Customers at or over the threshold today (the one-off grant's dry run). */
export async function listBigSpenderQualifiers(
	settings: BigSpenderSettings
): Promise<BigSpenderQualifier[]> {
	const grouped = await prisma.order.groupBy({
		by: ['userId'],
		where: { AND: [buildRevenueOrderWhere(), { userId: { not: null } }] },
		_sum: { totalAmount: true, refundedAmount: true }
	});
	const over = grouped
		.map((row) => ({
			userId: row.userId!,
			spend: toNetSales(row._sum.totalAmount, row._sum.refundedAmount)
		}))
		.filter((row) => row.spend >= settings.thresholdNgn);
	if (over.length === 0) return [];
	const ids = over.map((row) => row.userId);
	const [users, gifts, grants] = await Promise.all([
		prisma.user.findMany({
			where: { id: { in: ids } },
			select: { id: true, email: true, fullName: true }
		}),
		prisma.walletTransaction.findMany({
			where: { reference: { in: ids.map((id) => `spend:gift:70k:${id}`) } },
			select: { userId: true }
		}),
		prisma.walletTransaction.findMany({
			where: { reference: { in: ids.map(BIGSPENDER_REFERENCE) } },
			select: { userId: true }
		})
	]);
	const userById = new Map(users.map((user) => [user.id, user]));
	const gifted = new Set(gifts.map((row) => row.userId));
	const granted = new Set(grants.map((row) => row.userId));
	return over
		.map((row) => ({
			userId: row.userId,
			email: userById.get(row.userId)?.email ?? null,
			name: userById.get(row.userId)?.fullName ?? null,
			lifetimeSpend: row.spend,
			hadSpendGift70k: gifted.has(row.userId),
			alreadyGranted: granted.has(row.userId)
		}))
		.sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
}

/**
 * Owner's one-off grant to customers who were already over the threshold. Only runs while the
 * campaign is on, and only for exactly the customers the owner saw in the dry run.
 */
export async function grantBigSpenderToExisting(params: {
	approvedUserIds: string[];
	actorUserId: string;
}): Promise<{ success: boolean; granted: number; error?: string }> {
	const { bigSpender } = await getCampaignSettings();
	const now = new Date();
	if (!isCampaignLive(bigSpender, now)) {
		return { success: false, granted: 0, error: 'Switch BIGSPENDER on before granting.' };
	}
	const due = (await listBigSpenderQualifiers(bigSpender)).filter((row) => !row.alreadyGranted);
	const dueIds = due.map((row) => row.userId).sort();
	const approved = [...new Set(params.approvedUserIds)].sort();
	if (dueIds.length === 0 || dueIds.join(',') !== approved.join(',')) {
		return {
			success: false,
			granted: 0,
			error: 'The list changed since the dry run. Reload the page and review it again.'
		};
	}
	let granted = 0;
	for (const row of due) {
		if (
			await grantBigSpender(row.userId, bigSpender, now, {
				existingQualifier: true,
				approvedBy: params.actorUserId
			})
		) {
			granted += 1;
		}
	}
	await createAdminAuditLog({
		actorUserId: params.actorUserId,
		action: 'bigspender_existing_granted',
		resourceType: 'promo_campaign',
		resourceId: 'bigspender',
		description: `BIGSPENDER granted to ${granted} existing customers (${naira(granted * bigSpender.rewardNgn)})`,
		metadata: { userIds: approved, rewardNgn: bigSpender.rewardNgn },
		required: true
	});
	return { success: true, granted };
}

/**
 * Expiry reminders for BIGSPENDER credit. Written but OFF: returns immediately unless the owner
 * turns reminders on. Consent, suppression and de-duplication go through the marketing sender.
 */
export async function runBigSpenderExpiryReminders(now: Date = new Date()): Promise<{
	enabled: boolean;
	sent: number;
}> {
	const { bigSpender } = await getCampaignSettings();
	if (!bigSpender.remindersEnabled) return { enabled: false, sent: 0 };
	const { sendMarketingEmail } = await import('$lib/services/email');
	const { getSiteBaseUrl } = await import('$lib/helpers/site-url');
	const windowEnd = new Date(now.getTime() + bigSpender.reminderDaysBefore * DAY_MS);
	let sent = 0;
	for (const [userId, lots] of await getAllPromoLotBalances(prisma, now)) {
		const lot = lots.find(
			(entry) =>
				entry.campaign === 'bigspender' &&
				!entry.expired &&
				entry.remaining > 0 &&
				entry.expiresAt <= windowEnd
		);
		if (!lot) continue;
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true, fullName: true }
		});
		if (!user?.email) continue;
		const referenceId = `bigspender-expiry:${lot.id}`;
		const firstName = user.fullName?.trim().split(/\s+/)[0] || 'there';
		const result = await sendMarketingEmail({
			to: user.email,
			userId,
			subject: `Your ${naira(lot.remaining)} store credit expires soon`,
			body: `Hi ${firstName},\n\nYou have ${naira(lot.remaining)} BIGSPENDER store credit that expires on ${formatPromoExpiry(lot.expiresAt)}. It can pay up to ${bigSpender.capPercent}% of an order and is applied at checkout.`,
			ctaText: 'Use my credit',
			ctaUrl: getSiteBaseUrl(),
			notificationType: 'promo_reminder',
			referenceId,
			campaignKey: referenceId
		}).catch(() => ({ success: false }));
		if (result.success) sent += 1;
	}
	return { enabled: true, sent };
}

// ---------------------------------------------------------------------------------------------
// Expiry + cron entry point
// ---------------------------------------------------------------------------------------------

/** Close every promo lot that has passed its expiry (ledger hygiene; no messages). */
export async function expirePromoCredit(
	now: Date = new Date()
): Promise<{ lots: number; amount: number }> {
	let lots = 0;
	let amount = 0;
	for (const [userId, balances] of await getAllPromoLotBalances(prisma, now)) {
		for (const lot of balances.filter((entry) => entry.expired && entry.remaining > 0)) {
			const result = await prisma.$transaction((tx) =>
				closePromoLot(tx, {
					userId,
					lotId: lot.id,
					type: SC_PROMO_EXPIRY,
					description: `Promo credit expired on ${formatPromoExpiry(lot.expiresAt)}`,
					reference: `promo:expiry:${lot.id}`,
					requireExpired: true,
					now
				})
			);
			if (result.closed > 0) {
				lots += 1;
				amount += result.closed;
			}
		}
	}
	return { lots, amount };
}

/** Runs with the affiliate-vesting cron. Each part is isolated so one failure can't stop vesting. */
export async function runPromoCampaignJobs(now: Date = new Date()) {
	const safely = async <T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
		try {
			return await fn();
		} catch (error) {
			console.error(`promo campaign job ${name} failed:`, error);
			return { error: error instanceof Error ? error.message : 'failed' };
		}
	};
	return {
		expiry: await safely('expiry', () => expirePromoCredit(now)),
		referWin: await safely('refer_win', () => runReferWinIssuance(now)),
		bigSpenderReminders: await safely('bigspender_reminders', () =>
			runBigSpenderExpiryReminders(now)
		)
	};
}

// ---------------------------------------------------------------------------------------------
// Report (one calendar month, WAT)
// ---------------------------------------------------------------------------------------------

export interface PromoCampaignReport {
	campaign: CampaignKind;
	monthStart: Date;
	monthEnd: Date;
	issued: { count: number; amount: number };
	returnedAfterRefund: { amount: number };
	spent: { orders: number; amount: number };
	expired: { amount: number };
	reversed: { amount: number };
	refundedAfterSpendNotClawedBack: { count: number; amount: number };
	outstandingNow: number;
	cashOnPromoOrders: number;
	goodsCostOnPromoOrders: number | null;
	ordersMissingCost: number;
	estimatedNetAfterGoods: number | null;
}

export async function buildPromoCampaignReport(
	campaign: CampaignKind,
	monthOf: Date = new Date()
): Promise<PromoCampaignReport> {
	const monthStart = lagosMonthStart(monthOf);
	const monthEnd = nextLagosMonthStart(monthOf);
	const inMonth = { gte: monthStart, lt: monthEnd };
	const allLots = await prisma.walletTransaction.findMany({
		where: { type: SC_CREDIT_PROMO, metadata: { path: ['campaign'], equals: campaign } },
		select: { id: true, amount: true, createdAt: true, metadata: true }
	});
	const lotIds = new Set(allLots.map((lot) => lot.id));
	const [redemptions, closures, balances] = await Promise.all([
		prisma.walletTransaction.findMany({
			where: { type: SC_REDEEM_PROMO, status: 'available', createdAt: inMonth },
			select: { amount: true, metadata: true }
		}),
		prisma.walletTransaction.findMany({
			where: {
				type: { in: [SC_PROMO_EXPIRY, SC_PROMO_REVERSAL] },
				createdAt: inMonth,
				metadata: { path: ['campaign'], equals: campaign }
			},
			select: { type: true, amount: true }
		}),
		getAllPromoLotBalances(prisma)
	]);

	const issuedRows = allLots.filter(
		(lot) =>
			lot.createdAt >= monthStart &&
			lot.createdAt < monthEnd &&
			record(lot.metadata).kind !== 'promo_returned_after_refund'
	);
	const returnedRows = allLots.filter(
		(lot) =>
			lot.createdAt >= monthStart &&
			lot.createdAt < monthEnd &&
			record(lot.metadata).kind === 'promo_returned_after_refund'
	);

	let spentAmount = 0;
	const promoOrderIds = new Set<string>();
	for (const row of redemptions) {
		const metadata = record(row.metadata);
		const parts = Array.isArray(metadata.lots) ? metadata.lots.map(record) : [];
		const fromCampaign = parts
			.filter((part) => lotIds.has(String(part.lotId)))
			.reduce((sum, part) => sum + Math.max(0, Number(part.amount) || 0), 0);
		if (fromCampaign > 0) {
			spentAmount += fromCampaign;
			if (typeof metadata.orderId === 'string') promoOrderIds.add(metadata.orderId);
		}
	}

	const orders = promoOrderIds.size
		? await prisma.order.findMany({
				where: { id: { in: [...promoOrderIds] } },
				select: {
					totalAmount: true,
					storeCreditApplied: true,
					refundedAmount: true,
					analyticsMetadata: true
				}
			})
		: [];
	let cash = 0;
	let goods = 0;
	let missing = 0;
	for (const order of orders) {
		const total = Number(order.totalAmount || 0);
		const kept = total > 0 ? Math.max(0, total - Number(order.refundedAmount || 0)) / total : 0;
		cash += keptCash({
			totalAmount: total,
			storeCreditApplied: Number(order.storeCreditApplied || 0),
			refundedAmount: Number(order.refundedAmount || 0)
		});
		const cost = goodsCostFromOrderMetadata(order.analyticsMetadata);
		if (cost === null) missing += 1;
		else goods += cost * kept;
	}

	const afterSpend = await prisma.affiliateEvent.findMany({
		where: { type: `${campaign}_refunded_after_spend`, createdAt: inMonth },
		select: { metadata: true }
	});

	let outstanding = 0;
	for (const lots of balances.values()) {
		for (const lot of lots)
			if (lot.campaign === campaign && !lot.expired) outstanding += lot.remaining;
	}

	const sum = (rows: Array<{ amount: unknown }>) =>
		rows.reduce((total, row) => total + Number(row.amount || 0), 0);
	return {
		campaign,
		monthStart,
		monthEnd,
		issued: { count: issuedRows.length, amount: sum(issuedRows) },
		returnedAfterRefund: { amount: sum(returnedRows) },
		spent: { orders: promoOrderIds.size, amount: spentAmount },
		expired: { amount: sum(closures.filter((row) => row.type === SC_PROMO_EXPIRY)) },
		reversed: { amount: sum(closures.filter((row) => row.type === SC_PROMO_REVERSAL)) },
		refundedAfterSpendNotClawedBack: {
			count: afterSpend.length,
			amount: afterSpend.reduce(
				(total, row) => total + (Number(record(row.metadata).alreadySpentNotClawedBack) || 0),
				0
			)
		},
		outstandingNow: Math.round(outstanding * 100) / 100,
		cashOnPromoOrders: Math.round(cash * 100) / 100,
		goodsCostOnPromoOrders:
			orders.length === 0 ? 0 : missing === orders.length ? null : Math.round(goods),
		ordersMissingCost: missing,
		estimatedNetAfterGoods: missing > 0 ? null : Math.round(cash - goods)
	};
}
