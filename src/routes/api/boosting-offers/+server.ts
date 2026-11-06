import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { boostSaleInclude, inspectBoostSale } from '$lib/server/boosting-sale-readiness';
import { boostCustomerCopy, boostCustomerOption } from '$lib/helpers/boosting-customer-copy';
import { boostBenefitLabel } from '$lib/helpers/boosting-customer-facts';
import { getBoostingPricingConfig } from '$lib/services/boosting-pricing';
import type { RequestHandler } from './$types';

function isFoundationPending(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		(error.code === 'P2021' || error.code === 'P2022')
	);
}

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store',
		...(/^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || '')
			? { 'x-app-revision': env.VERCEL_GIT_COMMIT_SHA }
			: {})
	});
	try {
		const [offers, pricing] = await Promise.all([
			prisma.boostCustomerOffer.findMany({
				where: {
					status: 'live',
					category: { categoryType: 'boosting_service', isActive: true },
					routes: { some: { state: 'enabled', equivalenceApproved: true } }
				},
				include: { ...boostSaleInclude, category: { select: { name: true } } },
				orderBy: [{ displayOrder: 'asc' }, { customerName: 'asc' }]
			}),
			getBoostingPricingConfig()
		]);
		// Published rows alone must not collect money while production dispatch is disabled.
		const automationReady = env.BOOSTING_AUTOMATION_MODE === 'live';
		const compatibleOffers = (automationReady ? offers : []).flatMap((offer) => {
			const readiness = inspectBoostSale(offer, pricing.usdNgnRate);
			return readiness.available ? [{ offer, readiness }] : [];
		});
		return json({
			success: true,
			automationReady,
			// The old category catalogue is retired; with no live offer the storefront shows a pause.
			managedRolloutActive: true,
			data: compatibleOffers.map(({ offer, readiness }) => {
				const options = compatibleOffers.filter(
					(entry) => entry.offer.categoryId === offer.categoryId
				).length;
				const shown = boostCustomerOption(offer, options, offer.category.name);
				return {
					id: offer.id,
					categoryId: offer.categoryId,
					platform: offer.platform,
					outcome: offer.outcome,
					targetType: offer.targetType,
					...boostCustomerCopy(offer),
					benefitLabel: boostBenefitLabel(offer),
					customerName: shown.name,
					shortPromise: shown.line,
					qualityTier: offer.qualityTier,
					minQuantity: offer.minQuantity,
					maxQuantity: readiness.maximumQuantity,
					stepQuantity: offer.stepQuantity,
					quantityPresets: offer.quantityPresets,
					refillDays: offer.refillDays,
					displayOrder: offer.displayOrder,
					pricePerStepNgn: Number(offer.pricePerStepNgn)
				};
			})
		});
	} catch (error) {
		// Missing safety data must not resurrect legacy prices or purchase forms.
		if (isFoundationPending(error)) {
			return json({ success: true, managedRolloutActive: true, automationReady: false, data: [] });
		}
		throw error;
	}
};
