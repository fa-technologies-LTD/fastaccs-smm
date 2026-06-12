import { prisma } from '$lib/prisma';
import { getSitePopupsEnabledSetting } from './admin-settings';

export type SitePopupType = 'first_purchase' | 'catalog_updates';

export interface PendingSitePopup {
	type: SitePopupType;
	icon: string;
	title: string;
	body: string;
	ctaText: string;
}

const FIRST_PURCHASE_POPUP: PendingSitePopup = {
	type: 'first_purchase',
	icon: '🎉',
	title: 'Welcome to FastAccs',
	body: 'Your first order has been completed successfully.',
	ctaText: 'Got it'
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

export async function getPendingSitePopup(input: {
	userId: string;
	hasCompletedPurchase: boolean;
}): Promise<PendingSitePopup | null> {
	const popupsEnabled = await getSitePopupsEnabledSetting();
	if (!popupsEnabled) return null;

	const user = await prisma.user.findUnique({
		where: { id: input.userId },
		select: {
			firstPurchasePopupSeenAt: true,
			catalogUpdatesLastSeenAt: true
		}
	});

	if (!user) return null;

	if (input.hasCompletedPurchase && !user.firstPurchasePopupSeenAt) {
		return FIRST_PURCHASE_POPUP;
	}

	if (!user.catalogUpdatesLastSeenAt) {
		await prisma.user.update({
			where: { id: input.userId },
			data: { catalogUpdatesLastSeenAt: new Date() }
		});
		return null;
	}

	return getCatalogUpdatesPopup(user.catalogUpdatesLastSeenAt);
}

export async function markSitePopupSeen(userId: string, type: SitePopupType): Promise<void> {
	const field: 'firstPurchasePopupSeenAt' | 'catalogUpdatesLastSeenAt' =
		type === 'first_purchase' ? 'firstPurchasePopupSeenAt' : 'catalogUpdatesLastSeenAt';

	await prisma.user.update({
		where: { id: userId },
		data: { [field]: new Date() }
	});
}
