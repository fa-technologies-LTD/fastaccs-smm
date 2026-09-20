import { error } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_PLATFORM_LABELS,
	getBoostingServiceConfig
} from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
import type { PageServerLoad } from './$types';

const PLATFORM_REVIEW_ORDER = [
	'x',
	'instagram',
	'tiktok',
	'youtube',
	'facebook',
	'spotify',
	'telegram'
];
const OUTCOME_REVIEW_ORDER = [
	'followers',
	'subscribers',
	'members',
	'views',
	'likes',
	'comments',
	'streams',
	'monthly_listeners',
	'reposts',
	'reactions',
	'shares',
	'saves',
	'watch_time'
];
const TIER_LABELS: Record<string, string> = {
	value: 'Affordable',
	stable: 'More stable',
	premium: 'Premium'
};

function reviewRank(platform: string, outcome: string, qualityTier: string): number {
	// The owner already knows the exact service they want for Premium X followers, so make that
	// the first deliberate review instead of burying it in the generated catalogue.
	if (platform === 'x' && outcome === 'followers' && qualityTier === 'premium') return -10_000;
	const platformIndex = Math.max(0, PLATFORM_REVIEW_ORDER.indexOf(platform));
	const outcomeIndex = Math.max(0, OUTCOME_REVIEW_ORDER.indexOf(outcome));
	const tierIndex = qualityTier === 'stable' ? 0 : qualityTier === 'premium' ? 1 : 2;
	return platformIndex * 1_000 + outcomeIndex * 10 + tierIndex;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		throw error(403, 'Catalogue permission is required.');
	}
	const categories = await prisma.category.findMany({
		where: { categoryType: 'boosting_service' },
		select: {
			id: true,
			name: true,
			metadata: true,
			isActive: true,
			boostCustomerOffers: {
				select: {
					qualityTier: true,
					status: true,
					routes: { select: { state: true, equivalenceApproved: true } }
				}
			}
		},
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
	});
	const offerRows = categories.flatMap((category) => category.boostCustomerOffers);
	const firstReviewQueue = categories
		.flatMap((category) => {
			const config = getBoostingServiceConfig(category.metadata);
			return category.boostCustomerOffers
				.filter((offer) => offer.status !== 'reviewed' && offer.routes.length > 0)
				.map((offer) => ({
					categoryId: category.id,
					categoryName: category.name,
					qualityTier: offer.qualityTier,
					qualityLabel: TIER_LABELS[offer.qualityTier] ?? offer.qualityTier,
					platformLabel: BOOSTING_PLATFORM_LABELS[config.platform],
					outcomeLabel: BOOSTING_ACTION_LABELS[config.actionType],
					routeCount: offer.routes.length,
					rank: reviewRank(config.platform, config.actionType, offer.qualityTier)
				}));
		})
		.sort(
			(left, right) => left.rank - right.rank || left.categoryName.localeCompare(right.categoryName)
		)
		.filter(
			(item, index, all) => all.findIndex((other) => other.categoryId === item.categoryId) === index
		)
		.slice(0, 6)
		.map(({ rank: _rank, ...item }) => item);
	return {
		mappingSummary: {
			categories: categories.length,
			tiers: offerRows.length,
			reviewedTiers: offerRows.filter((offer) => offer.status === 'reviewed').length,
			approvedRoutes: offerRows
				.flatMap((offer) => offer.routes)
				.filter((route) => route.equivalenceApproved).length
		},
		firstReviewQueue,
		offers: categories.map((category) => {
			const config = getBoostingServiceConfig(category.metadata);
			const metadata =
				category.metadata &&
				typeof category.metadata === 'object' &&
				!Array.isArray(category.metadata)
					? (category.metadata as Record<string, unknown>)
					: {};
			return {
				id: category.id,
				name: category.name,
				isActive: category.isActive,
				platform: config.platform,
				platformLabel: BOOSTING_PLATFORM_LABELS[config.platform],
				outcome: config.actionType,
				outcomeLabel: BOOSTING_ACTION_LABELS[config.actionType],
				pricePerStepNgn: config.pricePerStep,
				isGeneratedDraft: metadata.boosting_draft_generated === true,
				tierCount: category.boostCustomerOffers.length,
				reviewedTierCount: category.boostCustomerOffers.filter(
					(offer) => offer.status === 'reviewed'
				).length,
				approvedRouteCount: category.boostCustomerOffers
					.flatMap((offer) => offer.routes)
					.filter((route) => route.equivalenceApproved).length
			};
		})
	};
};
