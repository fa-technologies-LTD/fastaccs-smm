import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { getCacheHeaders } from '$lib/helpers/cache';
import { getInventoryStatsSnapshot } from '$lib/services/admin-metrics';
import { getLowStockThresholdSetting } from '$lib/services/admin-settings';
import { getAllocatedLikeAccountStatuses, normalizeAccountStatus } from '$lib/helpers/account-status';

// GET /api/inventory - Get inventory stats and data
export async function GET({ url, locals }) {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const type = url.searchParams.get('type') || 'all';

		if (type === 'stats') {
			const stats = await getInventoryStatsSnapshot();

			return json(
				{ data: stats, error: null },
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
					const allocatedCount = accounts.filter((a) => normalizeAccountStatus(a.status) === 'allocated').length;

					return {
						id: tier.id,
						tier_name: tier.name, // This is the actual tier name
					platform_name: tier.parent?.name || 'Unknown Platform', // This is the actual platform name
					category_name: tier.name,
					platform: tier.parent?.name || 'Unknown', // Keep for backwards compatibility
					total_accounts: accounts.length,
						available_accounts: availableCount,
						accounts_available: availableCount, // UI expects this field name
						reserved_accounts: reservedCount,
						reservations_active: reservedCount, // UI expects this field name
						allocated_accounts: allocatedCount,
						assigned_accounts: allocatedCount, // Backward compatibility
						delivered_accounts: accounts.filter((a) => a.status === 'delivered').length,
						visible_available: availableCount, // UI expects this field name
						created_at: tier.createdAt,
						updated_at: tier.updatedAt,
					last_updated: tier.updatedAt // UI expects this field name
				};
			});

			return json({ data: tierInventory, error: null });
		}

		// Default: return combined data
		const [stats, categories] = await Promise.all([
			// Stats
			Promise.all([
				prisma.accountBatch.count(),
				prisma.account.count(),
				prisma.account.count({ where: { status: 'available' } }),
				prisma.account.count({ where: { status: 'reserved' } })
				]).then(([totalBatches, totalAccounts, availableAccounts, reservedAccounts]) => ({
					total_batches: totalBatches,
					total_accounts: totalAccounts,
					available_accounts: availableAccounts,
					reserved_accounts: reservedAccounts,
					allocated_accounts: 0, // Will be filled below
					assigned_accounts: 0, // Backward compatibility
					delivered_accounts: 0,
					out_of_stock: 0, // Will be filled below
					low_stock: 0, // Will be filled below
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
			})
		]);

		// Complete stats calculation
			const allocatedCount = await prisma.account.count({
				where: { status: { in: getAllocatedLikeAccountStatuses() } }
			});
			const deliveredCount = await prisma.account.count({ where: { status: 'delivered' } });

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

			stats.allocated_accounts = allocatedCount;
			stats.assigned_accounts = allocatedCount;
			stats.delivered_accounts = deliveredCount;
		stats.out_of_stock = outOfStockBatches;
		stats.low_stock = lowStockBatches;
		stats.platforms = platformsCount.length;

		// Transform categories to show PLATFORM/TIER inventory
			const tierInventoryData = categories.map((tier) => {
				const accounts = tier.accounts;
				const availableCount = accounts.filter((a) => a.status === 'available').length;
				const reservedCount = accounts.filter((a) => a.status === 'reserved').length;
				const allocatedCount = accounts.filter((a) => normalizeAccountStatus(a.status) === 'allocated').length;

				return {
				id: tier.id,
				tier_name: tier.name, // This is the actual tier name
				platform_name: tier.parent?.name || 'Unknown Platform', // This is the actual platform name
				category_name: tier.name,
				platform: tier.parent?.name || 'Unknown', // Keep for backwards compatibility
				total_accounts: accounts.length,
					available_accounts: availableCount,
					accounts_available: availableCount, // UI expects this field name
					reserved_accounts: reservedCount,
					reservations_active: reservedCount, // UI expects this field name
					allocated_accounts: allocatedCount,
					assigned_accounts: allocatedCount, // Backward compatibility
					delivered_accounts: accounts.filter((a) => a.status === 'delivered').length,
				visible_available: availableCount, // UI expects this field name
				created_at: tier.createdAt,
				updated_at: tier.updatedAt,
				last_updated: tier.updatedAt // UI expects this field name
			};
		});

		return json({
			data: {
				stats,
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
