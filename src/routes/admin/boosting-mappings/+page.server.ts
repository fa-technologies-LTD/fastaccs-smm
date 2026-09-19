import { error } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BOOSTING_ACTION_LABELS,
	BOOSTING_PLATFORM_LABELS,
	getBoostingServiceConfig
} from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
import type { PageServerLoad } from './$types';

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
	return {
		mappingSummary: {
			categories: categories.length,
			tiers: offerRows.length,
			reviewedTiers: offerRows.filter((offer) => offer.status === 'reviewed').length,
			approvedRoutes: offerRows
				.flatMap((offer) => offer.routes)
				.filter((route) => route.equivalenceApproved).length
		},
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
