import { prisma } from '$lib/prisma';
import { getSitePopupsEnabledSetting } from './admin-settings';
import { CONFIRMED_PAYMENT_STATUSES } from '$lib/helpers/buyer-order-visibility';
import {
	NUMBERS_LAUNCH_POPUP,
	isNumbersLaunchPopupWindowOpen,
	userHasBoughtNumber
} from './numbers-campaign';

export type SitePopupType =
	| 'first_purchase'
	| 'catalog_updates'
	| 'boosting_launch'
	| 'boosting_crosssell'
	| 'numbers_launch'
	| 'affiliate_refresh'
	| 'bank_details_outcome';

// Cross-sell popup only nudges buyers for their first few orders, then stops.
const BOOSTING_CROSSSELL_MAX_ORDERS = 3;

export interface SitePopupBodyItem {
	label: string;
	href?: string;
}

export interface PendingSitePopup {
	type: SitePopupType;
	icon: string;
	title: string;
	body: string;
	bodyItems?: SitePopupBodyItem[];
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

const NUMBERS_LAUNCH_POPUP_DEF: PendingSitePopup = {
	type: 'numbers_launch',
	icon: NUMBERS_LAUNCH_POPUP.icon,
	title: NUMBERS_LAUNCH_POPUP.title,
	body: NUMBERS_LAUNCH_POPUP.body,
	ctaText: NUMBERS_LAUNCH_POPUP.ctaText,
	secondaryHref: NUMBERS_LAUNCH_POPUP.secondaryHref,
	secondaryText: NUMBERS_LAUNCH_POPUP.secondaryText
};

const BOOSTING_CROSSSELL_POPUP: PendingSitePopup = {
	type: 'boosting_crosssell',
	icon: '⚡',
	title: 'Grow the account you just bought',
	body: 'Add real followers, likes & views with our Boosting Services — pick a platform, paste your link, done.',
	ctaText: 'Maybe later',
	secondaryHref: '/services',
	secondaryText: 'Boost my account →'
};

// One-time "the affiliate program got better" announcement, adaptive to whether the
// viewer is already an active affiliate (WS3.9 all-users + WS3.2c new-affiliate notice).
function getAffiliateRefreshPopup(isActiveAffiliate: boolean): PendingSitePopup {
	if (isActiveAffiliate) {
		return {
			type: 'affiliate_refresh',
			icon: '⚡',
			title: 'Your affiliate program just leveled up',
			body: 'Your referral code is ready to share — and you now earn real, withdrawable cash on every friend’s order. Spend it on-site or cash it out to your bank.',
			ctaText: 'Got it',
			secondaryHref: '/dashboard?tab=affiliate',
			secondaryText: 'View my code →'
		};
	}
	return {
		type: 'affiliate_refresh',
		icon: '🎉',
		title: 'Earn cash by referring friends',
		body: 'Our affiliate program is better than ever: make your first purchase to unlock your own referral code, then earn real, withdrawable cash every time a friend buys with it.',
		ctaText: 'Got it',
		secondaryHref: '/how-it-works?tab=affiliate',
		secondaryText: 'See how it works →'
	};
}

function getBankDetailsOutcomePopup(submission: {
	status: string;
	rejectionReason: string | null;
}): PendingSitePopup {
	if (submission.status === 'approved') {
		return {
			type: 'bank_details_outcome',
			icon: '✅',
			title: 'Bank details approved',
			body: 'Your bank details have been approved. You can now request payouts.',
			ctaText: 'Got it',
			secondaryHref: '/affiliate/bank-details',
			secondaryText: 'View details'
		};
	}

	return {
		type: 'bank_details_outcome',
		icon: '⚠️',
		title: 'Bank details need attention',
		body: submission.rejectionReason
			? `Your bank details were not approved: ${submission.rejectionReason}`
			: 'Your bank details were not approved. Please update and resubmit.',
		ctaText: 'Got it',
		secondaryHref: '/affiliate/bank-details',
		secondaryText: 'Update details'
	};
}

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
			select: { name: true, slug: true, parent: { select: { slug: true } } },
			orderBy: { name: 'asc' }
		}),
		prisma.category.findMany({
			where: {
				categoryType: 'platform',
				isActive: true,
				createdAt: { gt: since }
			},
			select: { name: true, slug: true },
			orderBy: { name: 'asc' }
		})
	]);

	if (restockedTypes.length === 0 && newPlatforms.length === 0) return null;

	// A restocked tier deep-links to its tier page; a new platform to its platform page.
	const tierHref = (r: { slug: string | null; parent: { slug: string | null } | null }) =>
		r.parent?.slug && r.slug ? `/platforms/${r.parent.slug}/tiers/${r.slug}` : undefined;
	const platformHref = (p: { slug: string | null }) => (p.slug ? `/platforms/${p.slug}` : undefined);

	let body: string;
	let bodyItems: SitePopupBodyItem[];
	if (restockedTypes.length > 0 && newPlatforms.length > 0) {
		body = 'Fresh restocks and new additions to the catalog:';
		bodyItems = [
			...restockedTypes.map((r) => ({ label: `${r.name} — back in stock`, href: tierHref(r) })),
			...newPlatforms.map((p) => ({ label: `${p.name} — new`, href: platformHref(p) }))
		];
	} else if (restockedTypes.length > 0) {
		body =
			restockedTypes.length === 1
				? "Back in stock — grab it before it's gone:"
				: "Back in stock — grab them before they're gone:";
		bodyItems = restockedTypes.map((r) => ({ label: r.name, href: tierHref(r) }));
	} else {
		body = 'Just added to the catalog:';
		bodyItems = newPlatforms.map((p) => ({ label: p.name, href: platformHref(p) }));
	}

	return {
		type: 'catalog_updates',
		icon: '🆕',
		title: "Here's what's new since your last visit",
		body,
		bodyItems,
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

async function countCompletedPurchases(userId: string): Promise<number> {
	// Only account purchases count toward the "grow the account you just bought"
	// cross-sell — number (phone) and boosting orders must not trigger it.
	return prisma.order.count({
		where: {
			userId,
			orderType: 'account',
			status: { in: ['paid', 'processing', 'completed'] },
			paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
		}
	});
}

async function hasUserPurchasedBoosting(userId: string): Promise<boolean> {
	const count = await prisma.orderItem.count({
		where: {
			boostTargetUrl: { not: null },
			order: {
				userId,
				status: { in: ['paid', 'processing', 'completed'] },
				paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
			}
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
			boostingLaunchPopupSeenAt: true,
			numbersLaunchPopupSeenAt: true,
			boostingCrossSellPopupSeenCount: true,
			affiliateRefreshPopupSeenAt: true,
			isAffiliateEnabled: true,
			bankDetailsPopupSeenAt: true,
			affiliatePrograms: { select: { status: true }, take: 1 },
			affiliatePayoutDetails: {
				select: { status: true, rejectionReason: true, reviewedAt: true }
			}
		}
	});

	if (!user) return null;

	if (!user.firstPurchasePopupSeenAt) {
		const hasCompletedPurchase = await hasUserCompletedAnyPurchase(userId);
		if (hasCompletedPurchase) return FIRST_PURCHASE_POPUP;
	}

	// "Numbers are live" launch announcement — only during the campaign window, once
	// per user, and never to someone who has already bought a number.
	if (!user.numbersLaunchPopupSeenAt && (await isNumbersLaunchPopupWindowOpen())) {
		if (!(await userHasBoughtNumber(userId))) return NUMBERS_LAUNCH_POPUP_DEF;
	}

	{
		const submission = user.affiliatePayoutDetails;
		const hasUnseenOutcome =
			submission?.reviewedAt &&
			(submission.status === 'approved' || submission.status === 'rejected') &&
			(!user.bankDetailsPopupSeenAt || submission.reviewedAt > user.bankDetailsPopupSeenAt);
		if (hasUnseenOutcome) {
			return getBankDetailsOutcomePopup(submission!);
		}
	}

	// One-time affiliate-program refresh announcement (adaptive to affiliate status).
	if (!user.affiliateRefreshPopupSeenAt) {
		const isActiveAffiliate = Boolean(
			user.isAffiliateEnabled && user.affiliatePrograms[0]?.status === 'active'
		);
		return getAffiliateRefreshPopup(isActiveAffiliate);
	}

	if (!user.boostingLaunchPopupSeenAt) {
		return BOOSTING_LAUNCH_POPUP;
	}

	// Boosting cross-sell: nudge buyers who haven't tried boosting, once per order
	// for their first BOOSTING_CROSSSELL_MAX_ORDERS orders (shown-count < min(orders, cap)).
	{
		const completedOrders = await countCompletedPurchases(userId);
		const target = Math.min(completedOrders, BOOSTING_CROSSSELL_MAX_ORDERS);
		if (completedOrders > 0 && user.boostingCrossSellPopupSeenCount < target) {
			const boughtBoosting = await hasUserPurchasedBoosting(userId);
			if (!boughtBoosting) return BOOSTING_CROSSSELL_POPUP;
		}
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
	// Cross-sell is count-based (shown once per order for the first few orders),
	// not a one-time date flag — increment instead of stamping a timestamp.
	if (type === 'boosting_crosssell') {
		await prisma.user.update({
			where: { id: userId },
			data: { boostingCrossSellPopupSeenCount: { increment: 1 } }
		});
		return;
	}

	const field:
		| 'firstPurchasePopupSeenAt'
		| 'catalogUpdatesLastSeenAt'
		| 'boostingLaunchPopupSeenAt'
		| 'numbersLaunchPopupSeenAt'
		| 'affiliateRefreshPopupSeenAt'
		| 'bankDetailsPopupSeenAt' =
		type === 'first_purchase'
			? 'firstPurchasePopupSeenAt'
			: type === 'boosting_launch'
				? 'boostingLaunchPopupSeenAt'
				: type === 'numbers_launch'
					? 'numbersLaunchPopupSeenAt'
					: type === 'affiliate_refresh'
						? 'affiliateRefreshPopupSeenAt'
						: type === 'bank_details_outcome'
							? 'bankDetailsPopupSeenAt'
							: 'catalogUpdatesLastSeenAt';

	await prisma.user.update({
		where: { id: userId },
		data: { [field]: new Date() }
	});
}
