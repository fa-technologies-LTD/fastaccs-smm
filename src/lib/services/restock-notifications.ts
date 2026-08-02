import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from './email';
import { pickVariantIndex, RESTOCK_VARIANTS } from './email-variants';
import { sendPushToUser } from './push-notifications';
import { env } from '$env/dynamic/private';

interface RestockTierInfo {
	id: string;
	name: string;
	slug: string;
	price: number;
	availableCount: number;
	platformName: string;
	platformSlug: string;
}

async function getTierInfo(tierId: string): Promise<RestockTierInfo | null> {
	const tier = await prisma.category.findFirst({
		where: {
			id: tierId,
			categoryType: 'tier'
		},
		include: {
			parent: {
				select: {
					name: true,
					slug: true
				}
			},
			accounts: {
				where: { status: 'available' },
				select: { id: true }
			}
		}
	});

	if (!tier) return null;

	const metadata = (tier.metadata || {}) as {
		pricing?: { base_price?: number | string };
		price?: number | string;
	};
	const price = Number(metadata.pricing?.base_price || metadata.price || 0);

	return {
		id: tier.id,
		name: tier.name,
		slug: tier.slug,
		price,
		availableCount: tier.accounts.length,
		platformName: tier.parent?.name || 'Platform',
		platformSlug: tier.parent?.slug || ''
	};
}

export async function triggerRestockNotificationsForTier(tierId: string): Promise<void> {
	const tierInfo = await getTierInfo(tierId);
	if (!tierInfo || tierInfo.availableCount <= 0) return;

	const subscribers = await prisma.restockSubscription.findMany({
		where: {
			tierId,
			notifiedAt: null
		}
	});

	if (subscribers.length === 0) return;

	const baseUrl = (
		env.PUBLIC_BASE_URL ||
		process.env.PUBLIC_BASE_URL ||
		'https://smm.fastaccs.com'
	).replace(/\/+$/, '');
	const tierUrl = `${baseUrl}/platforms/${tierInfo.platformSlug}/tiers/${tierInfo.slug}`;
	const urgencyNote =
		tierInfo.availableCount <= 5
			? `Only ${tierInfo.availableCount} left — these go fast.`
			: `${tierInfo.availableCount} accounts are currently available.`;

	const notifiedSubscriptionIds = (
		await Promise.all(
			subscribers.map(async (subscriber) => {
				const vi = await pickVariantIndex(subscriber.userId, 'restock_alert', RESTOCK_VARIANTS.length);
				const variant = RESTOCK_VARIANTS[vi];
				const vars = {
					tier: tierInfo.name,
					platform: tierInfo.platformName,
					urgency: urgencyNote
				};
				const emailResult = await sendMarketingEmail({
					to: subscriber.email,
					subject: variant.subject(vars),
					body: variant.body(vars),
					ctaText: variant.ctaText,
					ctaUrl: tierUrl,
					userId: subscriber.userId,
					notificationType: 'restock_alert',
					referenceId: tierInfo.id,
					campaignKey: `restock:${subscriber.id}`
				});

				if (!emailResult.success) return null;

				await sendPushToUser(subscriber.userId, {
					title: `${tierInfo.name} is back in stock`,
					body: urgencyNote,
					url: tierUrl
				}).catch(() => {});

				return subscriber.id;
			})
		)
	).filter((id): id is string => id !== null);

	if (notifiedSubscriptionIds.length > 0) {
		await prisma.restockSubscription.updateMany({
			where: { id: { in: notifiedSubscriptionIds } },
			data: { notifiedAt: new Date() }
		});
	}
}

/**
 * Notify subscribers that a Numbers tier (service + country) is buyable again. Numbers have no
 * `accounts`, so this can't use the account-stock path above — the caller (catalog sync) passes
 * the display name + price and points customers at /numbers. Best-effort; never throws.
 */
export async function triggerNumbersRestockForTier(
	tierId: string,
	tierName: string,
	priceNgn: number
): Promise<void> {
	const subscribers = await prisma.restockSubscription.findMany({
		where: { tierId, notifiedAt: null }
	});
	if (subscribers.length === 0) return;

	const baseUrl = (
		env.PUBLIC_BASE_URL ||
		process.env.PUBLIC_BASE_URL ||
		'https://smm.fastaccs.com'
	).replace(/\/+$/, '');
	const url = `${baseUrl}/numbers`;
	const priceLabel = priceNgn > 0 ? ` — now ₦${priceNgn.toLocaleString()}` : '';

	const notified = (
		await Promise.all(
			subscribers.map(async (s) => {
				const emailResult = await sendMarketingEmail({
					to: s.email,
					subject: `${tierName} numbers are back in stock`,
					body: `Good news — ${tierName} verification numbers are available again${priceLabel}. Grab one before they sell out.`,
					ctaText: 'Get your number',
					ctaUrl: url,
					userId: s.userId,
					notificationType: 'restock_alert',
					referenceId: tierId,
					campaignKey: `restock:${s.id}`
				});
				if (!emailResult.success) return null;
				await sendPushToUser(s.userId, {
					title: `${tierName} numbers are back`,
					body: 'Tap to grab one before they sell out.',
					url
				}).catch(() => {});
				return s.id;
			})
		)
	).filter((id): id is string => id !== null);

	if (notified.length > 0) {
		await prisma.restockSubscription.updateMany({
			where: { id: { in: notified } },
			data: { notifiedAt: new Date() }
		});
	}
}
