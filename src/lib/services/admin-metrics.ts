import { prisma } from '$lib/prisma';
import { serverCache } from '$lib/helpers/cache';
import { getLowStockThresholdSetting } from '$lib/services/admin-settings';

const PENDING_ORDER_STATUSES = ['pending', 'pending_payment'] as const;
const PROCESSING_ORDER_STATUSES = ['processing', 'paid'] as const;
const COMPLETED_ORDER_STATUSES = ['completed'] as const;
const FAILED_ORDER_STATUSES = ['failed', 'cancelled'] as const;
const REVENUE_ORDER_STATUSES = ['paid', 'completed'] as const;

export interface AdminOrderStatsSnapshot {
	total_orders: number;
	pending_orders: number;
	processing_orders: number;
	completed_orders: number;
	failed_orders: number;
	todays_orders: number;
	total_revenue: number;
	todays_revenue: number;
}

export interface AdminInventoryStatsSnapshot {
	total_tiers: number;
	total_available: number;
	total_reserved: number;
	out_of_stock: number;
	low_stock: number;
	platforms: number;
	accountsInOutOfStockTiers: number;
	outOfStockTiersCount: number;
	lowStockThreshold: number;
}

function startOfToday(): Date {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date;
}

export async function getOrderStatsSnapshot(): Promise<AdminOrderStatsSnapshot> {
	const today = startOfToday();

	const [
		totalOrders,
		pendingOrders,
		processingOrders,
		completedOrders,
		failedOrders,
		todaysOrders,
		totalRevenue,
		todaysRevenue
	] = await Promise.all([
		prisma.order.count(),
		prisma.order.count({ where: { status: { in: [...PENDING_ORDER_STATUSES] } } }),
		prisma.order.count({ where: { status: { in: [...PROCESSING_ORDER_STATUSES] } } }),
		prisma.order.count({ where: { status: { in: [...COMPLETED_ORDER_STATUSES] } } }),
		prisma.order.count({ where: { status: { in: [...FAILED_ORDER_STATUSES] } } }),
		prisma.order.count({ where: { createdAt: { gte: today } } }),
		prisma.order.aggregate({
			_sum: { totalAmount: true },
			where: { status: { in: [...REVENUE_ORDER_STATUSES] } }
		}),
		prisma.order.aggregate({
			_sum: { totalAmount: true },
			where: {
				status: { in: [...REVENUE_ORDER_STATUSES] },
				createdAt: { gte: today }
			}
		})
	]);

	return {
		total_orders: totalOrders,
		pending_orders: pendingOrders,
		processing_orders: processingOrders,
		completed_orders: completedOrders,
		failed_orders: failedOrders,
		todays_orders: todaysOrders,
		total_revenue: Number(totalRevenue._sum.totalAmount || 0),
		todays_revenue: Number(todaysRevenue._sum.totalAmount || 0)
	};
}

export async function getInventoryStatsSnapshot(
	overrides: { lowStockThreshold?: number } = {}
): Promise<AdminInventoryStatsSnapshot> {
	const lowStockThreshold =
		overrides.lowStockThreshold ?? (await getLowStockThresholdSetting().catch(() => 10));

	const [totalTiers, totalPlatforms, totalAvailable, totalReserved, tiers] = await Promise.all([
		prisma.category.count({
			where: {
				categoryType: 'tier',
				isActive: true,
				parentId: { not: null }
			}
		}),
		prisma.category.count({
			where: {
				categoryType: 'platform',
				isActive: true
			}
		}),
		prisma.account.count({ where: { status: 'available' } }),
		prisma.account.count({ where: { status: 'reserved' } }),
		prisma.category.findMany({
			where: {
				categoryType: 'tier',
				isActive: true,
				parentId: { not: null }
			},
			select: {
				id: true,
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
		})
	]);

	const outOfStockTierIds = tiers
		.filter((tier) => tier._count.accounts === 0)
		.map((tier) => tier.id);

	const lowStockTiersCount = tiers.filter(
		(tier) => tier._count.accounts > 0 && tier._count.accounts < lowStockThreshold
	).length;

	const accountsInOutOfStockTiers = outOfStockTierIds.length
		? await prisma.account.count({
				where: {
					categoryId: { in: outOfStockTierIds },
					status: { not: 'delivered' }
				}
			})
		: 0;

	return {
		total_tiers: totalTiers,
		total_available: totalAvailable,
		total_reserved: totalReserved,
		out_of_stock: outOfStockTierIds.length,
		low_stock: lowStockTiersCount,
		platforms: totalPlatforms,
		accountsInOutOfStockTiers,
		outOfStockTiersCount: outOfStockTierIds.length,
		lowStockThreshold
	};
}

export function invalidateAdminStatsCache(): void {
	serverCache.invalidate('admin:order-stats');
	serverCache.invalidate('admin:inventory-stats');
}

export const ORDER_STATUS_GROUPS = {
	pending: [...PENDING_ORDER_STATUSES],
	processing: [...PROCESSING_ORDER_STATUSES],
	completed: [...COMPLETED_ORDER_STATUSES],
	failed: [...FAILED_ORDER_STATUSES],
	revenue: [...REVENUE_ORDER_STATUSES]
} as const;
