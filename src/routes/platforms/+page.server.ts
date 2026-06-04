import { prisma } from '$lib/prisma';
import { getTierMerchandisingState } from '$lib/helpers/tier-merchandising';
import { releaseExpiredExactPreviewReservations } from '$lib/services/exact-preview';
import type { PageServerLoad } from './$types';

export interface Platform {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	metadata?: Record<string, unknown>;
	tier_count?: number;
	total_accounts?: number;
	min_price?: number | null;
	sample_tiers?: Array<{
		name: string;
		slug: string;
		price: number;
	}>;
}

export interface PageData {
	platforms: Platform[];
}

interface TierMetadata {
	pricing?: {
		base_price?: number | string;
	};
	price?: number | string;
}

function getTierPrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;

	const tierMetadata = metadata as TierMetadata;
	const rawPrice = tierMetadata.pricing?.base_price ?? tierMetadata.price ?? 0;
	const price = Number(rawPrice);
	return Number.isFinite(price) && price > 0 ? price : 0;
}

function compareTiers(
	left: {
		name: string;
		sortOrder: number;
		metadata: unknown;
	},
	right: {
		name: string;
		sortOrder: number;
		metadata: unknown;
	}
): number {
	const leftMerchandising = getTierMerchandisingState(left.metadata);
	const rightMerchandising = getTierMerchandisingState(right.metadata);

	const pinnedDiff = Number(rightMerchandising.isPinned) - Number(leftMerchandising.isPinned);
	if (pinnedDiff !== 0) return pinnedDiff;

	if (leftMerchandising.isPinned && rightMerchandising.isPinned) {
		const priorityDiff =
			(leftMerchandising.pinPriority ?? Number.MAX_SAFE_INTEGER) -
			(rightMerchandising.pinPriority ?? Number.MAX_SAFE_INTEGER);
		if (priorityDiff !== 0) return priorityDiff;
	}

	const featuredDiff = Number(rightMerchandising.isFeatured) - Number(leftMerchandising.isFeatured);
	if (featuredDiff !== 0) return featuredDiff;

	if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
	return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

export const load: PageServerLoad = async (): Promise<PageData> => {
	try {
		await releaseExpiredExactPreviewReservations().catch((error) => {
			console.error('Failed to release expired exact-preview reservations before catalog load:', error);
		});

		const platforms = await prisma.category.findMany({
			where: {
				categoryType: 'platform',
				isActive: true
			},
			orderBy: {
				sortOrder: 'asc'
			},
			select: {
				id: true,
				name: true,
				slug: true,
				description: true,
				metadata: true,
				children: {
					where: {
						categoryType: 'tier',
						isActive: true
					},
					select: {
						name: true,
						slug: true,
						metadata: true,
						sortOrder: true,
						_count: {
							select: {
								accounts: {
									where: {
										status: 'available'
									}
								}
							}
						}
					}
				}
			}
		});

		return {
			platforms: platforms.map((platform) => {
				const tiers = [...platform.children].sort(compareTiers);
				const tierPrices = tiers.map((tier) => getTierPrice(tier.metadata));
				const positiveTierPrices = tierPrices.filter((price) => price > 0);

				return {
					id: platform.id,
					name: platform.name,
					slug: platform.slug,
					description: platform.description,
					metadata: platform.metadata as Record<string, unknown>,
					tier_count: tiers.length,
					total_accounts: tiers.reduce((sum, tier) => sum + tier._count.accounts, 0),
					min_price:
						positiveTierPrices.length > 0 ? Math.min(...positiveTierPrices) : null,
					sample_tiers: tiers.slice(0, 6).map((tier, index) => ({
						name: tier.name,
						slug: tier.slug,
						price: tierPrices[index]
					}))
				};
			})
		};
	} catch (error) {
		console.error('Error loading platforms catalog:', error);
		return {
			platforms: []
		};
	}
};
