import { prisma } from '$lib/prisma';
import { getSitePopupsEnabledSetting } from './admin-settings';
import { CONFIRMED_PAYMENT_STATUSES } from '$lib/helpers/buyer-order-visibility';

export type SitePopupType = 'first_purchase' | 'catalog_updates' | 'boosting_launch';

export interface PendingSitePopup {
	type: SitePopupType;
	icon: string;
	title: string;
	body: string;
	ctaText: string;
	secondaryHref?: string;
	secondaryText?: string;
}

const FIRST_PURCHASE_POPUP: PendingSitePopup = {
	type: 'first_purchase',
	icon: '🎉',
	title: 'Welcome to FastAccs',
	body: 'Your first order has been completed successfully.',
	ctaText: 'Got it'
};

const BOOSTING_LAUNCH_POPUP: PendingSitePopup = {
	type: 'boosting_launch',
	icon: '🚀',
	title: 'Boosting services are now live',
	body: 'Paste your link, pay, we deliver.',
	ctaText: 'Got it',
	secondaryHref: '/services',
	secondaryText: 'Browse Boosting Services'
};

function joinNames(names: string[]): string {
	if (names.length <= 1) return names[0] || '';
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function getCatalogUpdatesPopup(since: Date): Promise<PendingSitePopup | null> {
	const [restockedTypes, newPlatforms] = await Promise.all([
		prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				accountBatches: { some: { createdAt: { gt: since } } },
				accounts: { some: { status: 'available' } }
			},
			select: { name: true },
			orderBy: { name: 'asc' }
		}),
		prisma.category.findMany({
			where: {
				categoryType: 'platform',
				isActive: true,
				createdAt: { gt: since }
			},
			select: { name: true },
			orderBy: { name: 'asc' }
		})
	]);

	const restockedNames = restockedTypes.map((category) => category.name);
	const platformNames = newPlatforms.map((category) => category.name);

	if (restockedNames.length === 0 && platformNames.length === 0) return null;

	let body: string;
	if (restockedNames.length > 0 && platformNames.length > 0) {
		body = `New stock just landed for ${joinNames(restockedNames)}, and we've added ${joinNames(platformNames)} to the catalog!`;
	} else if (restockedNames.length > 0) {
		body = `New stock just landed for ${joinNames(restockedNames)} — grab one before they're gone!`;
	} else {
		body = `We just added ${joinNames(platformNames)} to the catalog — check ${platformNames.length === 1 ? 'it' : 'them'} out!`;
	}

	return {
		type: 'catalog_updates',
		icon: '🆕',
		title: "Here's what's new since your last visit",
		body,
		ctaText: 'Got it'
	};
}

async function hasUserCompletedAnyPurchase(userId: string): Promise<boolean> {
	const count = await prisma.order.count({
		where: {
			userId,
			status: { in: ['paid', 'processing', 'completed'] },
			paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
		}
	});
	return count > 0;
}

export async function getPendingSitePopup(userId: string): Promise<PendingSitePopup | null> {
	const popupsEnabled = await getSitePopupsEnabledSetting();
	if (!popupsEnabled) return null;

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			firstPurchasePopupSeenAt: true,
			catalogUpdatesLastSeenAt: true,
			boostingLaunchPopupSeenAt: true
		}
	});

	if (!user) return null;

	if (!user.firstPurchasePopupSeenAt) {
		const hasCompletedPurchase = await hasUserCompletedAnyPurchase(userId);
		if (hasCompletedPurchase) return FIRST_PURCHASE_POPUP;
	}

	if (!user.boostingLaunchPopupSeenAt) {
		return BOOSTING_LAUNCH_POPUP;
	}

	if (!user.catalogUpdatesLastSeenAt) {
		await prisma.user.update({
			where: { id: userId },
			data: { catalogUpdatesLastSeenAt: new Date() }
		});
		return null;
	}

	return getCatalogUpdatesPopup(user.catalogUpdatesLastSeenAt);
}

export async function markSitePopupSeen(userId: string, type: SitePopupType): Promise<void> {
	const field: 'firstPurchasePopupSeenAt' | 'catalogUpdatesLastSeenAt' | 'boostingLaunchPopupSeenAt' =
		type === 'first_purchase'
			? 'firstPurchasePopupSeenAt'
			: type === 'boosting_launch'
				? 'boostingLaunchPopupSeenAt'
				: 'catalogUpdatesLastSeenAt';

	await prisma.user.update({
		where: { id: userId },
		data: { [field]: new Date() }
	});
}
