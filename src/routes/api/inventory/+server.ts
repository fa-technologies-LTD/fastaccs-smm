import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { getCacheHeaders } from '$lib/helpers/cache';
import { getInventoryStatsSnapshot } from '$lib/services/admin-metrics';
import { getLowStockPolicyState, getLowStockThresholdSetting } from '$lib/services/admin-settings';
import { getAllocatedLikeAccountStatuses, normalizeAccountStatus } from '$lib/helpers/account-status';

interface TierMetadataShape {
	pricing?: {
		base_price?: unknown;
	};
	price?: unknown;
}

function extractTierPrice(metadata: unknown): number {
	const typedMetadata =
		metadata && typeof metadata === 'object' ? (metadata as TierMetadataShape) : undefined;
	const rawPrice = typedMetadata?.pricing?.base_price ?? typedMetadata?.price;
	const parsed = Number(rawPrice);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isSoldAccountStatus(status: unknown): boolean {
	const normalized = normalizeAccountStatus(status);
	return normalized === 'delivered' || normalized === 'allocated';
}

// GET /api/inventory - Get inventory stats and data
export async function GET({ url, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const type = url.searchParams.get('type') || 'all';

		if (type === 'stats') {
			const [stats, lowStockPolicyState] = await Promise.all([
				getInventoryStatsSnapshot(),
				getLowStockPolicyState().catch(() => null)
			]);

			return json(
				{
					data: stats,
					low_stock_policy: lowStockPolicyState
						? {
								last_alert_at: lowStockPolicyState.lastAlertAt,
								last_digest_at: lowStockPolicyState.lastDigestAt,
								alerts_sent_today: lowStockPolicyState.sentToday,
								suppressed_today: lowStockPolicyState.suppressedCount,
								unresolved_zero_tiers: lowStockPolicyState.unresolvedZeroTierIds.length
							}
						: null,
					error: null
				},
				{
					headers: Object.fromEntries(
						Object.entries(getCacheHeaders('admin-live')).filter(([, v]) => v !== undefined)
					)
				}
			);
		}

			if (type === 'batches') {
				// Get PLATFORM/TIER inventory by grouping accounts by category hierarchy
				const categories = await prisma.category.findMany({
					where: {
						parentId: { not: null }, // Get child categories (tiers)
						categoryType: 'tier',
						isActive: true
					},
				include: {
					parent: true, // Get parent category (platform)
					accounts: {
						select: {
							id: true,
							status: true,
							platform: true
						}
					}
				}
			});

				const tierInventory = categories.map((tier) => {
					const accounts = tier.accounts;
					const availableCount = accounts.filter((a) => a.status === 'available').length;
					const reservedCount = accounts.filter((a) => a.status === 'reserved').length;
					const soldCount = accounts.filter((a) => isSoldAccountStatus(a.status)).length;
					const tierPrice = extractTierPrice(tier.metadata);

					return {
						id: tier.id,
						tier_name: tier.name, // This is the actual tier name
					platform_name: tier.parent?.name || 'Unknown Platform', // This is the actual platform name
					category_name: tier.name,
					platform: tier.parent?.name || 'Unknown', // Keep for backwards compatibility
					lifetime_total_accounts: accounts.length,
					total_accounts: accounts.length,
						available_accounts: availableCount,
						accounts_available: availableCount, // UI expects this field name
						reserved_accounts: reservedCount,
						reservations_active: reservedCount, // UI expects this field name
						allocated_accounts: soldCount, // Backward compatibility (now treated as delivered/sold)
						assigned_accounts: soldCount, // Backward compatibility
						delivered_accounts: soldCount,
						sold_accounts: soldCount,
						tier_price: tierPrice,
						visible_available: availableCount, // UI expects this field name
						created_at: tier.createdAt,
						updated_at: tier.updatedAt,
					last_updated: tier.updatedAt // UI expects this field name
				};
			});

			return json({ data: tierInventory, error: null });
		}

		// Default: return combined data
		const [stats, categories, lowStockPolicyState] = await Promise.all([
			// Stats
			Promise.all([
				prisma.accountBatch.count(),
				prisma.account.count(),
				prisma.account.count({ where: { status: 'available' } }),
				prisma.account.count({ where: { status: 'reserved' } })
				]).then(([totalBatches, totalAccounts, availableAccounts, reservedAccounts]) => ({
					total_batches: totalBatches,
					total_accounts: totalAccounts, // Lifetime stock currently tracked in account rows
					lifetime_total_accounts: totalAccounts,
					available_accounts: availableAccounts,
					reserved_accounts: reservedAccounts,
					allocated_accounts: 0, // Will be filled below
					assigned_accounts: 0, // Backward compatibility
					delivered_accounts: 0,
					sold_accounts: 0,
					out_of_stock: 0, // Will be filled below
					low_stock: 0, // Will be filled below
					low_stock_threshold: 0,
					platforms: 0 // Will be filled below
				})),

			// Get PLATFORM/TIER data from categories
				prisma.category.findMany({
					where: {
						parentId: { not: null }, // Get child categories (tiers)
						categoryType: 'tier',
						isActive: true
					},
				include: {
					parent: true, // Get parent category (platform)
					accounts: {
						select: {
							id: true,
							status: true,
							platform: true
						}
					}
				},
				orderBy: { createdAt: 'desc' }
			}),
			getLowStockPolicyState().catch(() => null)
		]);

		// Complete stats calculation
			const soldStatuses = [...new Set([...getAllocatedLikeAccountStatuses(), 'delivered'])];
			const soldCount = await prisma.account.count({
				where: { status: { in: soldStatuses } }
			});

		// Calculate missing stats
		const outOfStockBatches = await prisma.accountBatch.count({
			where: {
				accounts: {
					none: {
						status: 'available'
					}
				}
			}
		});

		const batchesWithCounts = await prisma.accountBatch.findMany({
			include: {
				_count: {
					select: {
						accounts: {
							where: { status: 'available' }
						}
					}
				}
			}
		});

		const lowStockThreshold = await getLowStockThresholdSetting().catch(() => 10);
		const lowStockBatches = batchesWithCounts.filter(
			(batch) =>
				batch._count.accounts > 0 && batch._count.accounts < Math.max(1, lowStockThreshold)
		).length;

		const platformsCount = await prisma.account.groupBy({
			by: ['platform'],
			where: { platform: { not: '' } }
		});

			stats.allocated_accounts = soldCount;
			stats.assigned_accounts = soldCount;
			stats.delivered_accounts = soldCount;
			stats.sold_accounts = soldCount;
			stats.low_stock_threshold = Math.max(1, lowStockThreshold);
		stats.out_of_stock = outOfStockBatches;
		stats.low_stock = lowStockBatches;
		stats.platforms = platformsCount.length;

		// Transform categories to show PLATFORM/TIER inventory
			const tierInventoryData = categories.map((tier) => {
				const accounts = tier.accounts;
				const availableCount = accounts.filter((a) => a.status === 'available').length;
				const reservedCount = accounts.filter((a) => a.status === 'reserved').length;
				const soldCount = accounts.filter((a) => isSoldAccountStatus(a.status)).length;
				const tierPrice = extractTierPrice(tier.metadata);

				return {
				id: tier.id,
				tier_name: tier.name, // This is the actual tier name
				platform_name: tier.parent?.name || 'Unknown Platform', // This is the actual platform name
				category_name: tier.name,
				platform: tier.parent?.name || 'Unknown', // Keep for backwards compatibility
				lifetime_total_accounts: accounts.length,
				total_accounts: accounts.length,
					available_accounts: availableCount,
					accounts_available: availableCount, // UI expects this field name
					reserved_accounts: reservedCount,
					reservations_active: reservedCount, // UI expects this field name
					allocated_accounts: soldCount, // Backward compatibility (now treated as delivered/sold)
					assigned_accounts: soldCount, // Backward compatibility
					delivered_accounts: soldCount,
					sold_accounts: soldCount,
					tier_price: tierPrice,
				visible_available: availableCount, // UI expects this field name
				created_at: tier.createdAt,
				updated_at: tier.updatedAt,
				last_updated: tier.updatedAt // UI expects this field name
			};
		});

		return json({
			data: {
				stats,
				low_stock_policy: lowStockPolicyState
					? {
							last_alert_at: lowStockPolicyState.lastAlertAt,
							last_digest_at: lowStockPolicyState.lastDigestAt,
							alerts_sent_today: lowStockPolicyState.sentToday,
							suppressed_today: lowStockPolicyState.suppressedCount,
							unresolved_zero_tiers: lowStockPolicyState.unresolvedZeroTierIds.length
						}
					: null,
				batches: tierInventoryData
			},
			error: null
		});
	} catch (error) {
		console.error('Inventory API error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
