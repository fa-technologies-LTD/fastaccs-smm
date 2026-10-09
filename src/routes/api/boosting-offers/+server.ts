import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { getBoostingDisplayExpectationChips } from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
import { supportsBoostServiceInput } from '$lib/helpers/boosting-service-input';
import { serviceMatchesBoostOutcome } from '$lib/server/boosting-providers/catalog-normalizer';
import {
	BOOSTING_MANAGED_STOREFRONT_KEY,
	isBoostingManagedStorefrontEnabled
} from '$lib/server/boosting-providers/storefront-rollout';
import type { RequestHandler } from './$types';

function isFoundationPending(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		(error.code === 'P2021' || error.code === 'P2022')
	);
}

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({
		'cache-control': 'public, max-age=15, s-maxage=30',
		...(/^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || '')
			? { 'x-app-revision': env.VERCEL_GIT_COMMIT_SHA }
			: {})
	});
	try {
		const [offers, rolloutMarker] = await Promise.all([
			prisma.boostCustomerOffer.findMany({
				where: {
					status: 'live',
					category: { categoryType: 'boosting_service', isActive: true },
					routes: { some: { state: 'enabled', equivalenceApproved: true } }
				},
				select: {
					id: true,
					categoryId: true,
					platform: true,
					outcome: true,
					targetType: true,
					customerName: true,
					shortPromise: true,
					expectationChips: true,
					qualityTier: true,
					minQuantity: true,
					maxQuantity: true,
					stepQuantity: true,
					quantityPresets: true,
					pricePerStepNgn: true,
					refillDays: true,
					displayOrder: true,
					routes: {
						where: { state: 'enabled', equivalenceApproved: true },
						select: {
							providerService: {
								select: {
									name: true,
									category: true,
									providerType: true,
									platforms: true,
									unavailableAt: true
								}
							}
						}
					}
				},
				orderBy: [{ displayOrder: 'asc' }, { customerName: 'asc' }]
			}),
			prisma.microcopy.findUnique({
				where: { key: BOOSTING_MANAGED_STOREFRONT_KEY },
				select: { value: true, isActive: true }
			})
		]);
		// Published rows alone must not collect money while production dispatch is disabled.
		const automationReady = env.BOOSTING_AUTOMATION_MODE === 'live';
		const compatibleOffers = (automationReady ? offers : []).filter((offer) =>
			offer.routes.some(
				({ providerService: service }) =>
					!service.unavailableAt &&
					service.platforms.includes(offer.platform) &&
					supportsBoostServiceInput(service.providerType, offer.outcome) &&
					serviceMatchesBoostOutcome(service, offer.outcome)
			)
		);
		return json({
			success: true,
			automationReady,
			managedRolloutActive: isBoostingManagedStorefrontEnabled(rolloutMarker, offers.length > 0),
			data: compatibleOffers.map(({ routes: _privateRoutes, ...offer }) => ({
				...offer,
				expectationChips: getBoostingDisplayExpectationChips(offer.expectationChips),
				pricePerStepNgn: Number(offer.pricePerStepNgn)
			}))
		});
	} catch (error) {
		// The rollout is additive: before its deliberate migration, the existing category copy remains
		// the storefront source of truth instead of breaking or hiding today's Boosting catalogue.
		if (isFoundationPending(error)) {
			return json({ success: true, managedRolloutActive: false, data: [] });
		}
		throw error;
	}
};
