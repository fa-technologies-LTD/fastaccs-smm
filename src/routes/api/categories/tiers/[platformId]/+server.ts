import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { getTierMerchandisingState } from '$lib/helpers/tier-merchandising';
import { getLowStockThresholdSetting } from '$lib/services/admin-settings';

interface TierMetadata {
	pricing?: {
		base_price?: number | string;
	};
	price?: number | string;
}

interface TierListItem {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	isActive: boolean;
	metadata: unknown;
	sortOrder: number;
	accountCount: number;
	price: number;
	productId: string;
	productStatus: string;
	isPinned: boolean;
	pinPriority: number | null;
	isFeatured: boolean;
	featuredBadge: string | null;
}

// GET /api/categories/tiers/[platformId] - Get tiers for a specific platform
export async function GET({ params }) {
	try {
		const platformId = params.platformId;
		const lowStockThreshold = await getLowStockThresholdSetting().catch(() => 10);

		// First, get the platform info to get the platform slug
		const platform = await prisma.category.findUnique({
			where: { id: platformId }
		});

		if (!platform) {
			return json({ data: null, error: 'Platform not found' }, { status: 404 });
		}

		// Get all tiers that belong to this platform
		const tiers = await prisma.category.findMany({
			where: {
				categoryType: 'tier',
				parentId: platformId, // Tiers that belong to this platform
				isActive: true
			},
			include: {
				accounts: {
					where: {
						status: 'available' // Only available accounts
					}
				}
			}
		});

		// Transform to include account counts and pricing from tier metadata
		const tiersWithCounts: TierListItem[] = tiers.map((tier) => {
			const metadata = tier.metadata as TierMetadata;
			const merchandising = getTierMerchandisingState(tier.metadata);

			// Extract price from new or old metadata format
			let price = 0;
			if (metadata?.pricing?.base_price) {
				price = Number(metadata.pricing.base_price);
			} else if (metadata?.price) {
				price = Number(metadata.price);
			}

			return {
				id: tier.id,
				name: tier.name,
				slug: tier.slug,
				description: tier.description,
				isActive: tier.isActive,
				metadata: tier.metadata,
				sortOrder: tier.sortOrder,
				accountCount: tier.accounts.length,
				price,
				productId: tier.id,
				productStatus: tier.isActive ? 'active' : 'inactive',
				isPinned: merchandising.isPinned,
				pinPriority: merchandising.pinPriority,
				isFeatured: merchandising.isFeatured,
				featuredBadge: merchandising.featuredBadge
			};
		});

		const sortedTiers = [...tiersWithCounts].sort((left, right) => {
			const leftPinnedWeight = left.isPinned ? 0 : 1;
			const rightPinnedWeight = right.isPinned ? 0 : 1;
			if (leftPinnedWeight !== rightPinnedWeight) {
				return leftPinnedWeight - rightPinnedWeight;
			}

			if (left.isPinned && right.isPinned) {
				const leftPriority = left.pinPriority ?? Number.MAX_SAFE_INTEGER;
				const rightPriority = right.pinPriority ?? Number.MAX_SAFE_INTEGER;
				if (leftPriority !== rightPriority) {
					return leftPriority - rightPriority;
				}
			}

			const leftFeaturedWeight = left.isFeatured ? 0 : 1;
			const rightFeaturedWeight = right.isFeatured ? 0 : 1;
			if (leftFeaturedWeight !== rightFeaturedWeight) {
				return leftFeaturedWeight - rightFeaturedWeight;
			}

			if (left.sortOrder !== right.sortOrder) {
				return left.sortOrder - right.sortOrder;
			}

			return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
		});

		const normalizedLowStockThreshold = Math.max(1, Number(lowStockThreshold || 10));
		return json({
			data: sortedTiers,
			lowStockThreshold: normalizedLowStockThreshold,
			error: null,
			meta: {
				lowStockThreshold: normalizedLowStockThreshold
			}
		});
	} catch (error) {
		console.error('Failed to fetch tiers:', error);
		return json({ data: null, error: 'Failed to fetch tiers' }, { status: 500 });
	}
}
