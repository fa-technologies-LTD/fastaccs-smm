import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getInventoryStatsSnapshot, getOrderStatsSnapshot } from '$lib/services/admin-metrics';
import { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';

type IntegrityCheckResult = {
	key: string;
	label: string;
	expected: number;
	actual: number;
	delta: number;
	ok: boolean;
};

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return { stats: {} };
		}

		const [orderStatsSnapshot, inventorySnapshot] = await Promise.all([
			getOrderStatsSnapshot(),
			getInventoryStatsSnapshot()
		]);

		// Get date ranges
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

		const [lastMonthRevenue, thisMonthRevenue] = await Promise.all([
			prisma.order.aggregate({
				where: {
					status: { in: [...ORDER_STATUS_GROUPS.revenue] },
					createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }
				},
				_sum: { totalAmount: true }
			}),
			prisma.order.aggregate({
				where: {
					status: { in: [...ORDER_STATUS_GROUPS.revenue] },
					createdAt: { gte: startOfMonth }
				},
				_sum: { totalAmount: true }
			})
		]);

		// Total Orders
		const totalOrders = orderStatsSnapshot.total_orders;
		const [lastMonthOrders, thisMonthOrders] = await Promise.all([
			prisma.order.count({
				where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }
			}),
			prisma.order.count({
				where: { createdAt: { gte: startOfMonth } }
			})
		]);

		// Total Customers
		const [totalCustomers, lastMonthCustomers, thisMonthCustomers] = await Promise.all([
			prisma.user.count({
				where: { userType: { in: ['REGISTERED', 'CONVERTED'] } }
			}),
			prisma.user.count({
				where: {
					userType: { in: ['REGISTERED', 'CONVERTED'] },
					createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }
				}
			}),
			prisma.user.count({
				where: {
					userType: { in: ['REGISTERED', 'CONVERTED'] },
					createdAt: { gte: startOfMonth }
				}
			})
		]);

		// Accounts sold should come from successful order items, not delivered-only account status.
		const [accountsSoldAggregate, lastMonthAccountsAggregate, thisMonthAccountsAggregate] =
			await Promise.all([
				prisma.orderItem.aggregate({
					where: {
						order: {
							status: { in: [...ORDER_STATUS_GROUPS.revenue] }
						}
					},
					_sum: { quantity: true }
				}),
				prisma.orderItem.aggregate({
					where: {
						order: {
							status: { in: [...ORDER_STATUS_GROUPS.revenue] },
							createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }
						}
					},
					_sum: { quantity: true }
				}),
				prisma.orderItem.aggregate({
					where: {
						order: {
							status: { in: [...ORDER_STATUS_GROUPS.revenue] },
							createdAt: { gte: startOfMonth }
						}
					},
					_sum: { quantity: true }
				})
			]);

		const accountsSold = accountsSoldAggregate._sum.quantity || 0;
		const lastMonthAccounts = lastMonthAccountsAggregate._sum.quantity || 0;
		const thisMonthAccounts = thisMonthAccountsAggregate._sum.quantity || 0;

		// Affiliate Stats
		const affiliateStats = await prisma.affiliateProgram.aggregate({
			_sum: { totalReferrals: true, totalSales: true, totalCommission: true },
			_count: { id: true }
		});

		// Inventory Stats
		const [totalAccounts, soldAccounts, pendingAccounts] = await Promise.all([
			prisma.account.count(),
			prisma.account.count({
				where: { status: { in: ['allocated', 'delivered'] } }
			}),
			prisma.account.count({
				where: { status: 'assigned' }
			})
		]);

		// Top Categories
		const topCategories = await prisma.orderItem.groupBy({
			where: {
				order: {
					status: { in: [...ORDER_STATUS_GROUPS.revenue] }
				}
			},
			by: ['categoryId'],
			_sum: { totalPrice: true, quantity: true },
			_count: { id: true },
			orderBy: { _sum: { totalPrice: 'desc' } },
			take: 5
		});

		const categoriesWithNames = await Promise.all(
			topCategories.map(async (cat) => {
				const category = await prisma.category.findUnique({
					where: { id: cat.categoryId }
				});
				return {
					name: category?.name || 'Unknown',
					revenue: Number(cat._sum.totalPrice || 0),
					unitsSold: cat._sum.quantity || 0,
					orderCount: cat._count.id
				};
			})
		);

		// Integrity checks: compare canonical snapshot values with direct aggregates.
		const [directTotalOrders, directRevenueAggregate, revenueFromOrderItemsAggregate] =
			await Promise.all([
				prisma.order.count(),
				prisma.order.aggregate({
					where: { status: { in: [...ORDER_STATUS_GROUPS.revenue] } },
					_sum: { totalAmount: true }
				}),
				prisma.orderItem.aggregate({
					where: { order: { status: { in: [...ORDER_STATUS_GROUPS.revenue] } } },
					_sum: { totalPrice: true }
				})
			]);

		const integrityChecks: IntegrityCheckResult[] = [
			{
				key: 'orders_total',
				label: 'Total orders snapshot matches direct count',
				expected: orderStatsSnapshot.total_orders,
				actual: directTotalOrders,
				delta: directTotalOrders - orderStatsSnapshot.total_orders,
				ok: orderStatsSnapshot.total_orders === directTotalOrders
			},
			{
				key: 'revenue_snapshot_vs_orders',
				label: 'Revenue snapshot matches order aggregate',
				expected: orderStatsSnapshot.total_revenue,
				actual: Number(directRevenueAggregate._sum.totalAmount || 0),
				delta:
					Number(directRevenueAggregate._sum.totalAmount || 0) - orderStatsSnapshot.total_revenue,
				ok:
					Math.abs(
						Number(directRevenueAggregate._sum.totalAmount || 0) - orderStatsSnapshot.total_revenue
					) < 0.01
			},
			{
				key: 'revenue_orders_vs_items',
				label: 'Revenue from orders matches revenue from order items',
				expected: Number(directRevenueAggregate._sum.totalAmount || 0),
				actual: Number(revenueFromOrderItemsAggregate._sum.totalPrice || 0),
				delta:
					Number(revenueFromOrderItemsAggregate._sum.totalPrice || 0) -
					Number(directRevenueAggregate._sum.totalAmount || 0),
				ok:
					Math.abs(
						Number(revenueFromOrderItemsAggregate._sum.totalPrice || 0) -
							Number(directRevenueAggregate._sum.totalAmount || 0)
					) < 0.01
			}
		];
		const integrityMismatches = integrityChecks.filter((check) => !check.ok);

		return {
			stats: {
				totalRevenue: Number(orderStatsSnapshot.total_revenue || 0),
				revenueChange:
					((Number(thisMonthRevenue._sum.totalAmount || 0) -
						Number(lastMonthRevenue._sum.totalAmount || 0)) /
						Number(lastMonthRevenue._sum.totalAmount || 1)) *
					100,

				totalOrders,
				ordersChange: ((thisMonthOrders - lastMonthOrders) / (lastMonthOrders || 1)) * 100,

				totalCustomers,
				customersChange:
					((thisMonthCustomers - lastMonthCustomers) / (lastMonthCustomers || 1)) * 100,

				accountsSold,
				accountsChange: ((thisMonthAccounts - lastMonthAccounts) / (lastMonthAccounts || 1)) * 100,

				activeAffiliates: affiliateStats._count.id || 0,
				totalReferrals: affiliateStats._sum.totalReferrals || 0,
				affiliateSales: Number(affiliateStats._sum.totalSales || 0),
				totalCommissions: Number(affiliateStats._sum.totalCommission || 0),

				totalAccounts,
				availableAccounts: inventorySnapshot.total_available,
				soldAccounts,
				pendingAccounts,

				topCategories: categoriesWithNames
			},
			integrity: {
				checkedAt: new Date().toISOString(),
				ok: integrityMismatches.length === 0,
				checks: integrityChecks,
				mismatches: integrityMismatches
			}
		};
	} catch (error) {
		console.error('Error loading analytics:', error);
		return { stats: {} };
	}
};
