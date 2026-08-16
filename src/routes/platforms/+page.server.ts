import { prisma } from '$lib/prisma';
import { getTierMerchandisingState } from '$lib/helpers/tier-merchandising';
import { serverCache } from '$lib/helpers/cache';
import type { PageServerLoad } from './$types';

const CATALOG_CACHE_KEY = 'catalog:platforms';
const CATALOG_CACHE_TTL_MS = 2 * 60 * 1000;
const POPULARITY_WINDOW_DAYS = 90;
const HIGH_ENGAGEMENT_RATE_PERCENT = 3;

export interface Platform {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	metadata?: Record<string, unknown>;
	tier_count?: number;
	total_accounts?: number;
	min_price?: number | null;
	recent_paid_units?: number;
	high_engagement_accounts?: number;
	average_engagement_rate?: number | null;
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
	pricing?: { base_price?: number | string };
	price?: number | string;
}

function getTierPrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const tierMetadata = metadata as TierMetadata;
	const price = Number(tierMetadata.pricing?.base_price ?? tierMetadata.price ?? 0);
	return Number.isFinite(price) && price > 0 ? price : 0;
}

function compareTiers(
	left: { name: string; sortOrder: number; metadata: unknown },
	right: { name: string; sortOrder: number; metadata: unknown }
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
		const cached = serverCache.get<PageData>(CATALOG_CACHE_KEY, CATALOG_CACHE_TTL_MS);
		if (cached) return cached;

		const popularitySince = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
		const [platforms, recentDemand, highEngagementInventory] = await Promise.all([
			prisma.category.findMany({
				where: { categoryType: 'platform', isActive: true },
				orderBy: { sortOrder: 'asc' },
				select: {
					id: true,
					name: true,
					slug: true,
					description: true,
					metadata: true,
					children: {
						where: { categoryType: 'tier', isActive: true },
						select: {
							id: true,
							name: true,
							slug: true,
							metadata: true,
							sortOrder: true,
							_count: {
								select: { accounts: { where: { status: 'available' } } }
							}
						}
					}
				}
			}),
			prisma.orderItem.groupBy({
				by: ['categoryId'],
				where: {
					order: {
						orderType: 'account',
						paymentStatus: 'paid',
						status: { in: ['paid', 'processing', 'completed'] },
						createdAt: { gte: popularitySince }
					}
				},
				_sum: { quantity: true }
			}),
			prisma.account.groupBy({
				by: ['categoryId'],
				where: {
					status: 'available',
					engagementRate: { gte: HIGH_ENGAGEMENT_RATE_PERCENT }
				},
				_count: { _all: true },
				_avg: { engagementRate: true }
			})
		]);

		const demandByTier = new Map(
			recentDemand.map((row) => [row.categoryId, Number(row._sum.quantity || 0)])
		);
		const engagementByTier = new Map(
			highEngagementInventory.map((row) => [
				row.categoryId,
				{
					count: row._count._all,
					average: row._avg.engagementRate ? Number(row._avg.engagementRate) : null
				}
			])
		);

		const result: PageData = {
			platforms: platforms.map((platform) => {
				const tiers = [...platform.children].sort(compareTiers);
				const tierPrices = tiers.map((tier) => getTierPrice(tier.metadata));
				const positiveTierPrices = tierPrices.filter((price) => price > 0);
				const recentPaidUnits = tiers.reduce(
					(sum, tier) => sum + (demandByTier.get(tier.id) || 0),
					0
				);
				const engagementRows = tiers
					.map((tier) => engagementByTier.get(tier.id))
					.filter((value): value is { count: number; average: number | null } => Boolean(value));
				const highEngagementAccounts = engagementRows.reduce((sum, row) => sum + row.count, 0);
				const weightedEngagementTotal = engagementRows.reduce(
					(sum, row) => sum + (row.average || 0) * row.count,
					0
				);

				return {
					id: platform.id,
					name: platform.name,
					slug: platform.slug,
					description: platform.description,
					metadata: platform.metadata as Record<string, unknown>,
					tier_count: tiers.length,
					total_accounts: tiers.reduce((sum, tier) => sum + tier._count.accounts, 0),
					min_price: positiveTierPrices.length > 0 ? Math.min(...positiveTierPrices) : null,
					recent_paid_units: recentPaidUnits,
					high_engagement_accounts: highEngagementAccounts,
					average_engagement_rate:
						highEngagementAccounts > 0 ? weightedEngagementTotal / highEngagementAccounts : null,
					sample_tiers: tiers.slice(0, 6).map((tier, index) => ({
						name: tier.name,
						slug: tier.slug,
						price: tierPrices[index]
					}))
				};
			})
		};

		serverCache.set(CATALOG_CACHE_KEY, result);
		return result;
	} catch (error) {
		console.error('Error loading platforms catalog:', error);
		return { platforms: [] };
	}
};
