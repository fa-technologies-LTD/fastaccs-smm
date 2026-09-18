import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
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
		const offers = await prisma.boostCustomerOffer.findMany({
			where: {
				status: 'reviewed',
				category: { categoryType: 'boosting_service', isActive: true }
			},
			select: {
				categoryId: true,
				customerName: true,
				shortPromise: true,
				expectationChips: true,
				qualityTier: true,
				displayOrder: true
			},
			orderBy: [{ displayOrder: 'asc' }, { customerName: 'asc' }]
		});
		return json({ success: true, data: offers });
	} catch (error) {
		// The rollout is additive: before its deliberate migration, the existing category copy remains
		// the storefront source of truth instead of breaking or hiding today's Boosting catalogue.
		if (isFoundationPending(error)) return json({ success: true, data: [] });
		throw error;
	}
};
