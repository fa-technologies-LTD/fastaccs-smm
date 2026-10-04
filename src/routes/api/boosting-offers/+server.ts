import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { getBoostingDisplayExpectationChips } from '$lib/helpers/boosting-service-config';
import { prisma } from '$lib/prisma';
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
		'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
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
					displayOrder: true
				},
				orderBy: [{ displayOrder: 'asc' }, { customerName: 'asc' }]
			}),
			prisma.microcopy.findUnique({
				where: { key: BOOSTING_MANAGED_STOREFRONT_KEY },
				select: { value: true, isActive: true }
			})
		]);
		return json({
			success: true,
			managedRolloutActive: isBoostingManagedStorefrontEnabled(rolloutMarker, offers.length > 0),
			data: offers.map((offer) => ({
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
