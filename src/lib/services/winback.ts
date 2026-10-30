import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendMarketingEmail } from './email';
import { pickVariantIndex, WINBACK_VARIANTS } from './email-variants';
import { getAdminSettingsSnapshot } from './admin-settings';
import { buildRevenueOrderWhere } from '$lib/helpers/order-revenue.server';
import { getTierStockStatus } from '$lib/helpers/tier-delivery-config';
import { getFirstOrderOffer } from './promotions';

const WINBACK_COOLDOWN_DAYS = 60;
// Never-bought sign-ups this new are still getting the welcome emails (with the first-order code).
const NEW_SIGNUP_SKIP_DAYS = 28;
const USUAL_TIER_LOOKBACK_DAYS = 180;

interface UsualTier {
	name: string;
	platformName: string;
	url: string;
	price: number;
}

/**
 * Each buyer's most-bought tier over the last six months, if it can be bought right now. Lets the
 * win-back say "your usual X is in stock" instead of a generic "fresh stock" note.
 */
async function getUsualTiersInStock(
	userIds: string[],
	baseUrl: string
): Promise<{ buyers: Set<string>; usual: Map<string, UsualTier> }> {
	const buyers = new Set<string>();
	const usual = new Map<string, UsualTier>();
	if (userIds.length === 0) return { buyers, usual };
	const orders = await prisma.order.findMany({
		where: { AND: [buildRevenueOrderWhere(), { userId: { in: userIds } }] },
		select: {
			userId: true,
			createdAt: true,
			orderItems: { select: { categoryId: true, quantity: true } }
		}
	});
	const since = Date.now() - USUAL_TIER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
	const unitsByUser = new Map<string, Map<string, number>>();
	for (const order of orders) {
		if (!order.userId) continue;
		buyers.add(order.userId);
		if (order.createdAt.getTime() < since) continue;
		const units = unitsByUser.get(order.userId) ?? new Map<string, number>();
		for (const item of order.orderItems) {
			if (!item.categoryId) continue;
			units.set(item.categoryId, (units.get(item.categoryId) ?? 0) + Math.max(1, item.quantity));
		}
		unitsByUser.set(order.userId, units);
	}
	const tierIds = [...new Set([...unitsByUser.values()].flatMap((units) => [...units.keys()]))];
	if (tierIds.length === 0) return { buyers, usual };
	const tiers = await prisma.category.findMany({
		where: { id: { in: tierIds }, categoryType: 'tier', isActive: true },
		select: {
			id: true,
			name: true,
			slug: true,
			metadata: true,
			parent: { select: { name: true, slug: true } },
			_count: { select: { accounts: { where: { status: 'available' } } } }
		}
	});
	const buyable = new Map<string, UsualTier>();
	for (const tier of tiers) {
		const metadata = (tier.metadata ?? {}) as Record<string, unknown>;
		const mode = String(metadata.delivery_mode || 'instant_auto');
		if (mode !== 'instant_auto' && mode !== 'manual_handover') continue;
		if (!getTierStockStatus(tier.metadata, tier._count.accounts).available) continue;
		const pricing = (metadata.pricing ?? {}) as Record<string, unknown>;
		buyable.set(tier.id, {
			name: tier.name.trim(),
			platformName: tier.parent?.name?.trim() || '',
			url: `${baseUrl}/platforms/${tier.parent?.slug || ''}/tiers/${tier.slug}`,
			price: Number(pricing.base_price ?? metadata.price ?? 0) || 0
		});
	}
	for (const [userId, units] of unitsByUser) {
		const best = [...units.entries()]
			.filter(([tierId]) => buyable.has(tierId))
			.sort((a, b) => b[1] - a[1])[0];
		if (best) usual.set(userId, buyable.get(best[0])!);
	}
	return { buyers, usual };
}

function getBaseUrl(): string {
	const candidate = (env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
	return candidate ? candidate.replace(/\/+$/, '') : 'https://smm.fastaccs.com';
}

function getFirstName(fullName: string | null | undefined, fallbackEmail: string): string {
	if (fullName && fullName.trim()) {
		return fullName.trim().split(/\s+/)[0];
	}
	return fallbackEmail.split('@')[0] || 'there';
}

async function getAvailablePlatformNames(limit = 3): Promise<string[]> {
	const tiers = await prisma.category.findMany({
		where: {
			categoryType: 'tier',
			isActive: true,
			accounts: {
				some: {
					status: 'available'
				}
			}
		},
		select: {
			parent: {
				select: {
					name: true
				}
			}
		},
		take: 100
	});

	const names = new Set<string>();
	for (const tier of tiers) {
		const platformName = tier.parent?.name?.trim();
		if (platformName) {
			names.add(platformName);
		}
		if (names.size >= limit) break;
	}

	return Array.from(names);
}

export async function runWinBackCampaign(): Promise<{
	queued: number;
	sent: number;
	skipped: number;
}> {
	const winbackDays = await getAdminSettingsSnapshot()
		.then((settings) => settings.notifications.winbackDaysThreshold)
		.catch(() => 20);
	const inactiveThreshold = new Date(Date.now() - winbackDays * 24 * 60 * 60 * 1000);
	const users = await prisma.user.findMany({
		where: {
			emailVerified: true,
			email: { not: null },
			isActive: true,
			OR: [
				{ lastSeenAt: { lte: inactiveThreshold } },
				{ lastSeenAt: null, lastLogin: { lte: inactiveThreshold } },
				{ lastSeenAt: null, lastLogin: null, registeredAt: { lte: inactiveThreshold } }
			]
		},
		select: {
			id: true,
			email: true,
			fullName: true,
			registeredAt: true
		},
		orderBy: [{ lastSeenAt: 'asc' }, { registeredAt: 'asc' }],
		take: 1000
	});
	const baseUrl = getBaseUrl();
	const { buyers, usual } = await getUsualTiersInStock(
		users.map((user) => user.id),
		baseUrl
	);
	const newSignupCutoff = Date.now() - NEW_SIGNUP_SKIP_DAYS * 24 * 60 * 60 * 1000;

	const recentWinbackThreshold = new Date(Date.now() - WINBACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
	const platforms = await getAvailablePlatformNames();
	const platformLine =
		platforms.length > 0
			? `Currently in stock: ${platforms.join(', ')}.`
			: 'Fresh inventory is available now.';

	let queued = 0;
	let sent = 0;
	let skipped = 0;

	for (const user of users) {
		if (!user.email) {
			skipped += 1;
			continue;
		}
		const isBuyer = buyers.has(user.id);
		// New never-bought sign-ups are in the welcome emails; don't double up.
		if (!isBuyer && user.registeredAt.getTime() > newSignupCutoff) {
			skipped += 1;
			continue;
		}

		const alreadySent = await prisma.emailNotification.findFirst({
			where: {
				userId: user.id,
				notificationType: 'win_back',
				status: 'sent',
				createdAt: { gte: recentWinbackThreshold }
			},
			select: { id: true }
		});

		if (alreadySent) {
			skipped += 1;
			continue;
		}

		queued += 1;
		const firstName = getFirstName(user.fullName, user.email);
		const usualTier = usual.get(user.id);
		const vi = await pickVariantIndex(user.id, 'win_back', WINBACK_VARIANTS.length);
		const variant = WINBACK_VARIANTS[vi];
		// Never-bought customers past the welcome emails: remind them of the first-order offer.
		const offer = isBuyer ? null : await getFirstOrderOffer(user.id).catch(() => null);
		const content = usualTier
			? {
					subject: `Your usual ${usualTier.name} is in stock`,
					body: `Hi ${firstName},\n\n${usualTier.platformName} ${usualTier.name}, the one you usually order, is in stock now.${usualTier.price > 0 ? ` ₦${usualTier.price.toLocaleString('en-NG')} each.` : ''}\n\nOrder one or several. We're here if you need help.`,
					ctaText: 'Order now',
					ctaUrl: usualTier.url
				}
			: {
					subject: variant.subject,
					body:
						variant.body({ firstName, platformLine }) +
						(offer ? `\n\nNew here? ${offer.label}: one tap at checkout.` : ''),
					ctaText: variant.ctaText,
					ctaUrl: `${baseUrl}/platforms`
				};
		const result = await sendMarketingEmail({
			to: user.email,
			subject: content.subject,
			body: content.body,
			ctaText: content.ctaText,
			ctaUrl: content.ctaUrl,
			userId: user.id,
			notificationType: 'win_back',
			referenceId: `winback:${user.id}`,
			campaignKey: `winback:${user.id}:${Math.floor(Date.now() / (WINBACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000))}`,
			bypassMarketingCooldown: true
		});

		if (result.success) {
			sent += 1;
		} else {
			skipped += 1;
		}
	}

	return { queued, sent, skipped };
}
