import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getTierMerchandisingState } from '$lib/helpers/tier-merchandising';
import { getTierStockStatus } from '$lib/helpers/tier-delivery-config';
import { getLowStockThresholdSetting } from '$lib/services/admin-settings';

export interface TierInventory {
	product_id: string;
	tier_name: string;
	tier_slug: string;
	category_id: string;
	category_name: string;
	description: string | null;
	metadata: Record<string, unknown>;
	accounts_available: number;
	reservations_active: number;
	visible_available: number;
	is_manual: boolean;
	price: number;
	product_status: string;
	tier_active: boolean;
	platform_name: string;
	platform_slug: string;
	is_pinned: boolean;
	pin_priority: number | null;
	is_featured: boolean;
	featured_badge: string | null;
	recent_paid_units: number;
}

interface TierMetadata {
	pricing?: { base_price?: number | string };
	price?: number | string;
}

const MANUAL_AVAILABLE_STOCK = 99;

function getPrice(metadata: unknown): number {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const value = metadata as TierMetadata;
	const price = Number(value.pricing?.base_price ?? value.price ?? 0);
	return Number.isFinite(price) && price > 0 ? price : 0;
}

export const load: PageServerLoad = async ({ params }) => {
	try {
		const popularitySince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
		const [platform, lowStockThreshold, recentDemand] = await Promise.all([
			prisma.category.findFirst({
				where: {
					slug: params.platform,
					categoryType: 'platform',
					isActive: true
				},
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
							description: true,
							isActive: true,
							metadata: true,
							sortOrder: true,
							_count: {
								select: { accounts: { where: { status: 'available' } } }
							}
						}
					}
				}
			}),
			getLowStockThresholdSetting().catch(() => 10),
			prisma.orderItem.groupBy({
				by: ['categoryId'],
				where: {
					category: { parent: { slug: params.platform } },
					order: {
						orderType: 'account',
						paymentStatus: 'paid',
						status: { in: ['paid', 'processing', 'completed'] },
						createdAt: { gte: popularitySince }
					}
				},
				_sum: { quantity: true }
			})
		]);

		if (!platform) throw error(404, 'Platform not found');

		const demandByTier = new Map(
			recentDemand.map((row) => [row.categoryId, Number(row._sum.quantity || 0)])
		);
		const tiers: TierInventory[] = platform.children
			.map((tier) => {
				const merchandising = getTierMerchandisingState(tier.metadata);
				const stock = getTierStockStatus(tier.metadata, tier._count.accounts);
				return {
					product_id: tier.id,
					tier_name: tier.name,
					tier_slug: tier.slug,
					category_id: tier.id,
					category_name: tier.name,
					description: tier.description,
					metadata: (tier.metadata || {}) as Record<string, unknown>,
					accounts_available: tier._count.accounts,
					reservations_active: 0,
					visible_available: stock.isManual
						? stock.available
							? MANUAL_AVAILABLE_STOCK
							: 0
						: tier._count.accounts,
					is_manual: stock.isManual,
					price: getPrice(tier.metadata),
					product_status: tier.isActive ? 'active' : 'inactive',
					tier_active: tier.isActive,
					platform_name: platform.name,
					platform_slug: platform.slug,
					is_pinned: merchandising.isPinned,
					pin_priority: merchandising.pinPriority,
					is_featured: merchandising.isFeatured,
					featured_badge: merchandising.featuredBadge,
					recent_paid_units: demandByTier.get(tier.id) || 0
				};
			})
			.sort((left, right) => {
				const pinned = Number(right.is_pinned) - Number(left.is_pinned);
				if (pinned !== 0) return pinned;
				if (left.is_pinned && right.is_pinned) {
					const priority =
						(left.pin_priority ?? Number.MAX_SAFE_INTEGER) -
						(right.pin_priority ?? Number.MAX_SAFE_INTEGER);
					if (priority !== 0) return priority;
				}
				const featured = Number(right.is_featured) - Number(left.is_featured);
				if (featured !== 0) return featured;
				const leftTier = platform.children.find((tier) => tier.id === left.category_id);
				const rightTier = platform.children.find((tier) => tier.id === right.category_id);
				const sortOrder = (leftTier?.sortOrder || 0) - (rightTier?.sortOrder || 0);
				if (sortOrder !== 0) return sortOrder;
				return left.tier_name.localeCompare(right.tier_name, undefined, { sensitivity: 'base' });
			});

		return {
			platform: {
				id: platform.id,
				name: platform.name,
				slug: platform.slug,
				description: platform.description || '',
				metadata: (platform.metadata || {}) as Record<string, unknown>
			},
			tiers,
			lowStockThreshold: Math.max(1, Number(lowStockThreshold || 10)),
			seo: {
				title: `Buy Real ${platform.name} Accounts | FastAccs`,
				description: `Browse verified, aged ${platform.name} accounts ready to use. Instant delivery, secure checkout, no passwords shared.`,
				type: 'website'
			}
		};
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		console.error('Error in platform page load:', cause);
		throw error(500, 'Failed to load platform data');
	}
};
