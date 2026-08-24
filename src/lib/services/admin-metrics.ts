import { prisma } from '$lib/prisma';
import { serverCache } from '$lib/helpers/cache';
import {
	getBusinessTimezoneSetting,
	getLowStockThresholdSetting
} from '$lib/services/admin-settings';
import { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';
import { getStartOfBusinessDayUtc } from '$lib/helpers/business-timezone';
import {
	buildRevenueOrderWhere,
	toNetSales,
	buildRevenueOrderItemWhere,
	buildRevenueOrderWindowWhere
} from '$lib/helpers/order-revenue.server';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { releaseExpiredExactPreviewReservations } from '$lib/services/exact-preview';

export interface AdminOrderStatsSnapshot {
	total_orders: number;
	paid_orders: number;
	pending_orders: number;
	processing_orders: number;
	completed_orders: number;
	cancelled_orders: number;
	failed_orders: number;
	todays_orders: number;
	total_revenue: number;
	todays_revenue: number;
	units_sold: number;
	total_users: number;
	manual_handovers_completed: number;
}

export interface AdminBoostingOrderStatsSnapshot {
	total_orders: number;
	pending_fulfillment: number;
	in_progress_fulfillment: number;
	completed_fulfillment: number;
	total_revenue: number;
	todays_revenue: number;
	this_month_revenue: number;
}

export interface AdminInventoryStatsSnapshot {
	total_tiers: number;
	total_available: number;
	total_reserved: number;
	total_sold: number;
	lifetime_sold_stock: number;
	out_of_stock: number;
	low_stock: number;
	platforms: number;
	product_types: number;
	accountsInOutOfStockTiers: number;
	outOfStockTiersCount: number;
	lowStockThreshold: number;
}

export async function getOrderStatsSnapshot(): Promise<AdminOrderStatsSnapshot> {
	const businessTimezone = await getBusinessTimezoneSetting().catch(() => 'Africa/Lagos');
	const today = getStartOfBusinessDayUtc(new Date(), businessTimezone);

	const ACCOUNT_ORDER_FILTER = { orderType: 'account' } as const;

	const [
		totalOrders,
		paidOrders,
		pendingOrders,
		processingOrders,
		completedOrders,
		cancelledOrders,
		failedOrders,
		todaysOrders,
		totalRevenue,
		todaysRevenue,
		unitsSold,
		totalUsers,
		manualHandoversCompleted
	] = await Promise.all([
		prisma.order.count({ where: ACCOUNT_ORDER_FILTER }),
		prisma.order.count({ where: { ...ACCOUNT_ORDER_FILTER, ...buildRevenueOrderWhere() } }),
		prisma.order.count({
			where: { ...ACCOUNT_ORDER_FILTER, status: { in: [...ORDER_STATUS_GROUPS.pending] } }
		}),
		prisma.order.count({
			where: { ...ACCOUNT_ORDER_FILTER, status: { in: [...ORDER_STATUS_GROUPS.processing] } }
		}),
		prisma.order.count({
			where: { ...ACCOUNT_ORDER_FILTER, status: { in: [...ORDER_STATUS_GROUPS.completed] } }
		}),
		prisma.order.count({
			where: {
				...ACCOUNT_ORDER_FILTER,
				OR: [{ status: 'cancelled' }, { paymentStatus: 'cancelled' }]
			}
		}),
		prisma.order.count({
			where: { ...ACCOUNT_ORDER_FILTER, status: { in: [...ORDER_STATUS_GROUPS.failed] } }
		}),
		prisma.order.count({ where: { ...ACCOUNT_ORDER_FILTER, createdAt: { gte: today } } }),
		// Revenue ("Sales") stays combined across account + boosting by design.
		prisma.order.aggregate({
			_sum: { totalAmount: true, refundedAmount: true },
			where: buildRevenueOrderWhere()
		}),
		prisma.order.aggregate({
			_sum: { totalAmount: true, refundedAmount: true },
			where: buildRevenueOrderWindowWhere(today)
		}),
		// Units sold tracks real account/stock inventory only — boosting never touches it.
		prisma.account.count({
			where: {
				status: { in: [...getAllocatedLikeAccountStatuses(), 'delivered'] },
				orderItem: {
					order: { ...buildRevenueOrderWhere(), ...ACCOUNT_ORDER_FILTER }
				}
			}
		}),
		prisma.user.count(),
		// Completed manual-handover sales (WhatsApp delivery, marked completed) — a
		// plain count for reconciling the assistant's manual-handover credit tallied
		// outside the app. Manual handovers finish at status='completed' (their
		// deliveryStatus stays 'processing'), so key off status.
		prisma.order.count({
			where: { deliveryMethod: 'whatsapp', status: 'completed' }
		})
	]);

	return {
		total_orders: totalOrders,
		paid_orders: paidOrders,
		pending_orders: pendingOrders,
		processing_orders: processingOrders,
		completed_orders: completedOrders,
		cancelled_orders: cancelledOrders,
		failed_orders: failedOrders,
		todays_orders: todaysOrders,
		total_revenue: toNetSales(totalRevenue._sum.totalAmount, totalRevenue._sum.refundedAmount),
		todays_revenue: toNetSales(todaysRevenue._sum.totalAmount, todaysRevenue._sum.refundedAmount),
		units_sold: unitsSold,
		total_users: totalUsers,
		manual_handovers_completed: manualHandoversCompleted
	};
}

export async function getBoostingOrderStatsSnapshot(): Promise<AdminBoostingOrderStatsSnapshot> {
	const businessTimezone = await getBusinessTimezoneSetting().catch(() => 'Africa/Lagos');
	const today = getStartOfBusinessDayUtc(new Date(), businessTimezone);
	const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	const BOOSTING_ORDER_FILTER = { orderType: 'boosting' } as const;

	const [totalOrders, totalRevenue, todaysRevenue, thisMonthRevenue, fulfillmentGrouped] =
		await Promise.all([
			prisma.order.count({
				where: { ...BOOSTING_ORDER_FILTER, ...buildRevenueOrderWhere() }
			}),
			prisma.order.aggregate({
				_sum: { totalAmount: true, refundedAmount: true },
				where: { ...BOOSTING_ORDER_FILTER, ...buildRevenueOrderWhere() }
			}),
			prisma.order.aggregate({
				_sum: { totalAmount: true, refundedAmount: true },
				where: { ...BOOSTING_ORDER_FILTER, ...buildRevenueOrderWindowWhere(today) }
			}),
			prisma.order.aggregate({
				_sum: { totalAmount: true, refundedAmount: true },
				where: { ...BOOSTING_ORDER_FILTER, ...buildRevenueOrderWindowWhere(startOfMonth) }
			}),
			prisma.orderItem.groupBy({
				by: ['boostFulfillmentStatus'],
				where: {
					boostTargetUrl: { not: null },
					order: { paymentStatus: 'paid' }
				},
				_count: { _all: true }
			})
		]);

	const fulfillmentCounts = { pending: 0, in_progress: 0, completed: 0 };
	for (const row of fulfillmentGrouped) {
		const status = row.boostFulfillmentStatus || 'pending';
		if (status === 'in_progress') fulfillmentCounts.in_progress += row._count._all;
		else if (status === 'completed') fulfillmentCounts.completed += row._count._all;
		else fulfillmentCounts.pending += row._count._all;
	}

	return {
		total_orders: totalOrders,
		pending_fulfillment: fulfillmentCounts.pending,
		in_progress_fulfillment: fulfillmentCounts.in_progress,
		completed_fulfillment: fulfillmentCounts.completed,
		total_revenue: toNetSales(totalRevenue._sum.totalAmount, totalRevenue._sum.refundedAmount),
		todays_revenue: toNetSales(todaysRevenue._sum.totalAmount, todaysRevenue._sum.refundedAmount),
		this_month_revenue: toNetSales(
			thisMonthRevenue._sum.totalAmount,
			thisMonthRevenue._sum.refundedAmount
		)
	};
}

export async function getInventoryStatsSnapshot(
	overrides: { lowStockThreshold?: number } = {}
): Promise<AdminInventoryStatsSnapshot> {
	await releaseExpiredExactPreviewReservations().catch((error) => {
		console.warn('[admin-metrics] expired exact reservation cleanup skipped:', error);
	});

	const lowStockThreshold =
		overrides.lowStockThreshold ?? (await getLowStockThresholdSetting().catch(() => 10));

	const soldStatuses = [...new Set([...getAllocatedLikeAccountStatuses(), 'delivered'])];
	const [totalTiers, totalPlatforms, totalAvailable, totalReserved, totalSold, tiers] =
		await Promise.all([
			prisma.category.count({
				where: {
					categoryType: 'tier',
					isActive: true,
					parentId: { not: null },
					// Numbers (auto-SMS) tiers aren't account inventory — exclude from the tier count.
					NOT: { metadata: { path: ['delivery_mode'], equals: 'auto_sms' } }
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
			prisma.account.count({ where: { status: { in: soldStatuses } } }),
			prisma.category.findMany({
				where: {
					categoryType: 'tier',
					isActive: true,
					parentId: { not: null },
					// Manual-handover AND numbers (auto-SMS) tiers have no account inventory —
					// they must never count toward account "out of stock".
					NOT: [
						{ metadata: { path: ['delivery_mode'], equals: 'manual_handover' } },
						{ metadata: { path: ['delivery_mode'], equals: 'auto_sms' } }
					]
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
		total_sold: totalSold,
		lifetime_sold_stock: totalSold,
		out_of_stock: outOfStockTierIds.length,
		low_stock: lowStockTiersCount,
		platforms: totalPlatforms,
		product_types: totalTiers,
		accountsInOutOfStockTiers,
		outOfStockTiersCount: outOfStockTierIds.length,
		lowStockThreshold
	};
}

export function invalidateAdminStatsCache(): void {
	serverCache.invalidate('admin:order-stats');
	serverCache.invalidate('admin:inventory-stats');
}

export { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';
