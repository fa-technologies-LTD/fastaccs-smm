import { prisma } from '$lib/prisma';
import { sendEmail } from './email';
import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';

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

	const metadata = (tier.metadata || {}) as { pricing?: { base_price?: number | string }; price?: number | string };
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

	const baseUrl = (env.PUBLIC_BASE_URL || PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
	const tierUrl = `${baseUrl}/platforms/${tierInfo.platformSlug}/tiers/${tierInfo.slug}`;
	const urgencyNote =
		tierInfo.availableCount <= 5
			? `Only ${tierInfo.availableCount} left — these go fast.`
			: `${tierInfo.availableCount} accounts are currently available.`;

	for (const subscriber of subscribers) {
		const emailResult = await sendEmail({
			to: subscriber.email,
			subject: `${tierInfo.name} accounts are back in stock!`,
			body: `${tierInfo.platformName} - ${tierInfo.name} is back in stock.

Available now: ${tierInfo.availableCount}
Price per account: ₦${tierInfo.price.toLocaleString('en-US')}

${urgencyNote}`,
			ctaText: 'Get yours before they sell out',
			ctaUrl: tierUrl,
			userId: subscriber.userId,
			notificationType: 'restock_alert',
			referenceId: tierInfo.id
		});

		if (emailResult.success) {
			await prisma.restockSubscription.update({
				where: { id: subscriber.id },
				data: { notifiedAt: new Date() }
			});
		}
	}
}
