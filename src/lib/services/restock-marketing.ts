import { prisma } from '$lib/prisma';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { getTierStockStatus } from '$lib/helpers/tier-delivery-config';
import { sendMarketingEmail } from '$lib/services/email';
import {
	getTierInfo,
	restockTierUrl,
	restockUrgencyNote,
	triggerRestockNotificationsForTier,
	type RestockTierInfo
} from '$lib/services/restock-notifications';

/**
 * Hourly restock marketing (runs with the low-stock cron):
 *  1. Catch-up: anyone who asked to be told about a tier that is buyable now gets their alert,
 *     even when it came back by a route that didn't fire one (a manual-handover tier switched on,
 *     stock returned to a tier, a tier re-shown).
 *  2. "Your usual is back": when a tier comes back after selling out, recent buyers of that tier
 *     get one email (returning buyers are most of the revenue). At most one such email a week
 *     per person, never to someone who ordered in the last 2 days.
 */

export const RESTOCK_SNAPSHOT_KEY = 'config.marketing.restock_snapshot';
const PAST_BUYER_WINDOW_DAYS = 120;
const RECENT_ORDER_SKIP_DAYS = 2;
const PER_PERSON_GAP_DAYS = 7;
const DAY_MS = 86_400_000;

type BuyableMap = Record<string, boolean>;

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Which active account tiers (instant or manual handover) can be bought right now. */
async function currentBuyableTiers(): Promise<BuyableMap> {
	const tiers = await prisma.category.findMany({
		where: { categoryType: 'tier', isActive: true },
		select: {
			id: true,
			metadata: true,
			_count: { select: { accounts: { where: { status: 'available' } } } }
		}
	});
	const map: BuyableMap = {};
	for (const tier of tiers) {
		const mode = String(record(tier.metadata).delivery_mode || 'instant_auto');
		if (mode !== 'instant_auto' && mode !== 'manual_handover') continue;
		map[tier.id] = getTierStockStatus(tier.metadata, tier._count.accounts).available;
	}
	return map;
}

async function loadSnapshot(): Promise<BuyableMap | null> {
	const row = await prisma.microcopy.findUnique({
		where: { key: RESTOCK_SNAPSHOT_KEY },
		select: { value: true }
	});
	if (!row?.value) return null;
	try {
		const parsed = record(JSON.parse(row.value));
		return Object.fromEntries(Object.entries(parsed).map(([id, value]) => [id, value === true]));
	} catch {
		return null;
	}
}

async function saveSnapshot(map: BuyableMap): Promise<void> {
	const value = JSON.stringify(map);
	await prisma.microcopy.upsert({
		where: { key: RESTOCK_SNAPSHOT_KEY },
		create: {
			key: RESTOCK_SNAPSHOT_KEY,
			value,
			category: 'settings',
			description: 'Which tiers were buyable at the last restock check (system-managed).',
			isActive: true
		},
		update: { value, updatedAt: new Date() }
	});
}

/** Tiers that were not buyable at the last check and are buyable now. */
export function newlyBuyableTiers(previous: BuyableMap, current: BuyableMap): string[] {
	return Object.entries(current)
		.filter(([id, buyable]) => buyable && previous[id] === false)
		.map(([id]) => id);
}

function firstName(fullName: string | null, email: string): string {
	return fullName?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there';
}

/** "Your usual is back": one email to each recent buyer of a tier that just came back. */
export async function notifyPastBuyersOfRestock(
	tier: RestockTierInfo,
	options: { now?: Date; limit?: number } = {}
): Promise<{ sent: number; skipped: number }> {
	const now = options.now ?? new Date();
	const limit = options.limit ?? 200;
	const buyers = await prisma.order.findMany({
		where: {
			AND: [
				buildRevenueOrderWhere(),
				{
					userId: { not: null },
					createdAt: { gte: new Date(now.getTime() - PAST_BUYER_WINDOW_DAYS * DAY_MS) },
					orderItems: { some: { categoryId: tier.id } }
				}
			]
		},
		select: { userId: true },
		distinct: ['userId']
	});
	const userIds = buyers.map((row) => row.userId).filter((id): id is string => Boolean(id));
	if (userIds.length === 0) return { sent: 0, skipped: 0 };

	const [recentOrders, recentUsualEmails, subscribers, users] = await Promise.all([
		prisma.order.findMany({
			where: {
				userId: { in: userIds },
				createdAt: { gte: new Date(now.getTime() - RECENT_ORDER_SKIP_DAYS * DAY_MS) }
			},
			select: { userId: true },
			distinct: ['userId']
		}),
		prisma.emailNotification.findMany({
			where: {
				userId: { in: userIds },
				notificationType: 'restock_alert',
				referenceId: { startsWith: 'usual-back:' },
				status: { in: ['pending', 'sent'] },
				createdAt: { gte: new Date(now.getTime() - PER_PERSON_GAP_DAYS * DAY_MS) }
			},
			select: { userId: true }
		}),
		// People who asked for this tier get the subscriber alert instead.
		prisma.restockSubscription.findMany({
			where: { tierId: tier.id, userId: { in: userIds } },
			select: { userId: true }
		}),
		prisma.user.findMany({
			where: { id: { in: userIds }, isActive: true },
			select: { id: true, email: true, fullName: true }
		})
	]);
	const skip = new Set(
		[...recentOrders, ...recentUsualEmails, ...subscribers]
			.map((row) => row.userId)
			.filter(Boolean) as string[]
	);
	const tierUrl = restockTierUrl(tier);
	const urgency = restockUrgencyNote(tier);
	const dayKey = now.toISOString().slice(0, 10);
	let sent = 0;
	let skipped = 0;
	for (const user of users) {
		if (sent >= limit) break;
		if (!user.email || skip.has(user.id)) {
			skipped += 1;
			continue;
		}
		const result = await sendMarketingEmail({
			to: user.email,
			subject: `Your usual ${tier.name} is back in stock`,
			preheader: urgency,
			body: `Hi ${firstName(user.fullName, user.email)},\n\n${tier.platformName} ${tier.name}, the one you ordered before, is back.${tier.price > 0 ? ` ₦${tier.price.toLocaleString('en-NG')} each.` : ''}\n\n${urgency}`,
			ctaText: 'Order now',
			ctaUrl: tierUrl,
			userId: user.id,
			notificationType: 'restock_alert',
			referenceId: `usual-back:${tier.id}`,
			campaignKey: `usual-back:${tier.id}:${user.id}:${dayKey}`,
			bypassMarketingCooldown: true
		}).catch(() => ({ success: false }));
		if (result.success) sent += 1;
		else skipped += 1;
	}
	return { sent, skipped };
}

export async function runRestockMarketing(now: Date = new Date()): Promise<{
	subscriberTiersChecked: number;
	newlyBuyable: number;
	pastBuyerEmails: number;
	firstRun: boolean;
}> {
	const current = await currentBuyableTiers();

	// 1. Catch-up for people who asked to be told.
	const openTierIds = (
		await prisma.restockSubscription.findMany({
			where: { notifiedAt: null },
			select: { tierId: true },
			distinct: ['tierId']
		})
	)
		.map((row) => row.tierId)
		.filter((id) => current[id]);
	for (const tierId of openTierIds) {
		await triggerRestockNotificationsForTier(tierId).catch((error) =>
			console.error('Restock catch-up failed:', error)
		);
	}

	// 2. "Your usual is back" for tiers that came back since the last check. The first run only
	// records today's state, so nobody is emailed about tiers that were already in stock.
	const previous = await loadSnapshot();
	let pastBuyerEmails = 0;
	const cameBack = previous ? newlyBuyableTiers(previous, current) : [];
	for (const tierId of cameBack) {
		const tier = await getTierInfo(tierId);
		if (!tier?.buyable) continue;
		const result = await notifyPastBuyersOfRestock(tier, { now }).catch((error) => {
			console.error('Past-buyer restock email failed:', error);
			return { sent: 0, skipped: 0 };
		});
		pastBuyerEmails += result.sent;
	}
	await saveSnapshot(current);
	return {
		subscriberTiersChecked: openTierIds.length,
		newlyBuyable: cameBack.length,
		pastBuyerEmails,
		firstRun: previous === null
	};
}
