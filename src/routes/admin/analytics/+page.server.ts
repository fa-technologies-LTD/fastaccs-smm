import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { getInventoryStatsSnapshot, getOrderStatsSnapshot } from '$lib/services/admin-metrics';
import { ORDER_STATUS_GROUPS } from '$lib/helpers/order-status';
import { getBusinessTimezoneSetting } from '$lib/services/admin-settings';
import {
	getBusinessDateKey,
	getBusinessMonthKey,
	getBusinessWeekKey,
	getRollingBusinessDateKeys,
	getStartOfBusinessDayUtc
} from '$lib/helpers/business-timezone';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

type IntegrityCheckResult = {
	key: string;
	label: string;
	expected: number;
	actual: number;
	delta: number;
	ok: boolean;
};

type RevenueBucket = {
	key: string;
	revenue: number;
	orderCount: number;
};

type BreakdownRow = {
	id: string;
	name: string;
	revenue: number;
	orderCount: number;
	unitsSold: number;
};

type TierVelocityRow = {
	tierId: string;
	tierName: string;
	platformName: string;
	available: number;
	soldLast30Days: number;
	rollingSellThroughRate: number;
	daysToSellOut: number | null;
	stagnant: boolean;
};

function shiftYearMonth(
	year: number,
	month: number,
	delta: number
): { year: number; month: number } {
	let nextYear = year;
	let nextMonth = month + delta;
	while (nextMonth < 1) {
		nextMonth += 12;
		nextYear -= 1;
	}
	while (nextMonth > 12) {
		nextMonth -= 12;
		nextYear += 1;
	}
	return { year: nextYear, month: nextMonth };
}

function getBusinessMonthStartUtc(year: number, month: number, timeZone: string): Date {
	return getStartOfBusinessDayUtc(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)), timeZone);
}

function toAmount(value: unknown): number {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.round(parsed * 100) / 100;
}

function createBucketMap(): Map<string, { revenue: number; orderIds: Set<string> }> {
	return new Map<string, { revenue: number; orderIds: Set<string> }>();
}

function pushBucket(
	map: Map<string, { revenue: number; orderIds: Set<string> }>,
	key: string,
	orderId: string,
	amount: number
): void {
	const existing = map.get(key);
	if (!existing) {
		map.set(key, { revenue: amount, orderIds: new Set([orderId]) });
		return;
	}
	existing.revenue += amount;
	existing.orderIds.add(orderId);
}

function mapBuckets(map: Map<string, { revenue: number; orderIds: Set<string> }>): RevenueBucket[] {
	return [...map.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => ({
			key,
			revenue: toAmount(value.revenue),
			orderCount: value.orderIds.size
		}));
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return { stats: {} };
		}

		const [orderStatsSnapshot, inventorySnapshot, businessTimezone, featureFlags] =
			await Promise.all([
				getOrderStatsSnapshot(),
				getInventoryStatsSnapshot(),
				getBusinessTimezoneSetting().catch(() => 'Africa/Lagos'),
				getFeatureFlagSnapshot().catch(() => ({
					adminPromotions: true,
					adminAnnouncementBanner: false,
					adminAdvancedAnalytics: true,
					adminRoleManagement: true,
					adminStoreControls: true
				}))
			]);

		const revenueVisible = canViewRevenue(locals);
		const now = new Date();
		const todayStart = getStartOfBusinessDayUtc(now, businessTimezone);
		const [yearText, monthText] = getBusinessDateKey(now, businessTimezone).split('-');
		const currentYear = Number(yearText || now.getUTCFullYear());
		const currentMonth = Number(monthText || now.getUTCMonth() + 1);
		const previous = shiftYearMonth(currentYear, currentMonth, -1);

		const startOfMonth = getBusinessMonthStartUtc(currentYear, currentMonth, businessTimezone);
		const startOfLastMonth = getBusinessMonthStartUtc(
			previous.year,
			previous.month,
			businessTimezone
		);
		const endOfLastMonth = new Date(startOfMonth.getTime() - 1);
		const advancedWindowStart = new Date(todayStart.getTime() - 180 * 24 * 60 * 60 * 1000);
		const last30DaysStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

		const [
			lastMonthRevenue,
			thisMonthRevenue,
			lastMonthOrders,
			thisMonthOrders,
			totalCustomers,
			lastMonthCustomers,
			thisMonthCustomers,
			accountsSoldAggregate,
			lastMonthAccountsAggregate,
			thisMonthAccountsAggregate,
			affiliateStats,
			totalAccounts,
			soldAccounts,
			pendingAccounts,
			directTotalOrders,
			directRevenueAggregate,
			revenueFromOrderItemsAggregate,
			advancedRevenueOrders,
			tierCatalog,
			recentSoldByTier,
			paidOrderCount,
			cancelledFailedOrderCount
		] = await Promise.all([
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
			}),
			prisma.order.count({
				where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }
			}),
			prisma.order.count({
				where: { createdAt: { gte: startOfMonth } }
			}),
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
			}),
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
			}),
			prisma.affiliateProgram.aggregate({
				_sum: { totalReferrals: true, totalSales: true, totalCommission: true },
				_count: { id: true }
			}),
			prisma.account.count(),
			prisma.account.count({
				where: { status: { in: ['allocated', 'delivered'] } }
			}),
			prisma.account.count({
				where: { status: 'assigned' }
			}),
			prisma.order.count(),
			prisma.order.aggregate({
				where: { status: { in: [...ORDER_STATUS_GROUPS.revenue] } },
				_sum: { totalAmount: true }
			}),
			prisma.orderItem.aggregate({
				where: { order: { status: { in: [...ORDER_STATUS_GROUPS.revenue] } } },
				_sum: { totalPrice: true }
			}),
			featureFlags.adminAdvancedAnalytics
				? prisma.order.findMany({
						where: {
							status: { in: [...ORDER_STATUS_GROUPS.revenue] },
							createdAt: { gte: advancedWindowStart }
						},
						select: {
							id: true,
							createdAt: true,
							totalAmount: true,
							orderItems: {
								select: {
									categoryId: true,
									quantity: true,
									totalPrice: true,
									category: {
										select: {
											id: true,
											name: true,
											parent: {
												select: {
													id: true,
													name: true
												}
											}
										}
									}
								}
							}
						}
					})
				: Promise.resolve([]),
			featureFlags.adminAdvancedAnalytics
				? prisma.category.findMany({
						where: {
							categoryType: 'tier',
							isActive: true,
							parentId: { not: null }
						},
						select: {
							id: true,
							name: true,
							parent: {
								select: {
									name: true
								}
							},
							_count: {
								select: {
									accounts: {
										where: {
											status: 'available'
										}
									}
								}
							}
						},
						orderBy: { name: 'asc' }
					})
				: Promise.resolve([]),
			featureFlags.adminAdvancedAnalytics
				? prisma.orderItem.groupBy({
						by: ['categoryId'],
						where: {
							order: {
								status: { in: [...ORDER_STATUS_GROUPS.revenue] },
								createdAt: { gte: last30DaysStart }
							}
						},
						_sum: { quantity: true }
					})
				: Promise.resolve([]),
			prisma.order.count({ where: { status: { in: [...ORDER_STATUS_GROUPS.revenue] } } }),
			prisma.order.count({ where: { status: { in: [...ORDER_STATUS_GROUPS.failed] } } })
		]);

		const accountsSold = Number(accountsSoldAggregate._sum.quantity || 0);
		const lastMonthAccounts = Number(lastMonthAccountsAggregate._sum.quantity || 0);
		const thisMonthAccounts = Number(thisMonthAccountsAggregate._sum.quantity || 0);

		const revenueByPlatformMap = new Map<
			string,
			{ id: string; name: string; revenue: number; unitsSold: number; orderIds: Set<string> }
		>();
		const revenueByTierMap = new Map<
			string,
			{
				id: string;
				name: string;
				platformName: string;
				revenue: number;
				unitsSold: number;
				orderIds: Set<string>;
			}
		>();
		const byDayMap = createBucketMap();
		const byWeekMap = createBucketMap();
		const byMonthMap = createBucketMap();

		for (const order of advancedRevenueOrders) {
			const orderTotal = toAmount(order.totalAmount);
			const dayKey = getBusinessDateKey(order.createdAt, businessTimezone);
			const weekKey = getBusinessWeekKey(order.createdAt, businessTimezone);
			const monthKey = getBusinessMonthKey(order.createdAt, businessTimezone);

			pushBucket(byDayMap, dayKey, order.id, orderTotal);
			pushBucket(byWeekMap, weekKey, order.id, orderTotal);
			pushBucket(byMonthMap, monthKey, order.id, orderTotal);

			for (const item of order.orderItems) {
				const platformId = item.category.parent?.id || 'unknown-platform';
				const platformName = item.category.parent?.name || 'Unknown platform';
				const tierId = item.category.id;
				const tierName = item.category.name || 'Unknown tier';
				const lineRevenue = toAmount(item.totalPrice);
				const quantity = Number(item.quantity || 0);

				const platformExisting = revenueByPlatformMap.get(platformId);
				if (!platformExisting) {
					revenueByPlatformMap.set(platformId, {
						id: platformId,
						name: platformName,
						revenue: lineRevenue,
						unitsSold: quantity,
						orderIds: new Set([order.id])
					});
				} else {
					platformExisting.revenue += lineRevenue;
					platformExisting.unitsSold += quantity;
					platformExisting.orderIds.add(order.id);
				}

				const tierExisting = revenueByTierMap.get(tierId);
				if (!tierExisting) {
					revenueByTierMap.set(tierId, {
						id: tierId,
						name: tierName,
						platformName,
						revenue: lineRevenue,
						unitsSold: quantity,
						orderIds: new Set([order.id])
					});
				} else {
					tierExisting.revenue += lineRevenue;
					tierExisting.unitsSold += quantity;
					tierExisting.orderIds.add(order.id);
				}
			}
		}

		const revenueByPlatform: BreakdownRow[] = [...revenueByPlatformMap.values()]
			.map((row) => ({
				id: row.id,
				name: row.name,
				revenue: toAmount(row.revenue),
				orderCount: row.orderIds.size,
				unitsSold: row.unitsSold
			}))
			.sort((a, b) => b.revenue - a.revenue);

		const revenueByTier: Array<BreakdownRow & { platformName: string }> = [
			...revenueByTierMap.values()
		]
			.map((row) => ({
				id: row.id,
				name: row.name,
				platformName: row.platformName,
				revenue: toAmount(row.revenue),
				orderCount: row.orderIds.size,
				unitsSold: row.unitsSold
			}))
			.sort((a, b) => b.revenue - a.revenue);

		const byDay = mapBuckets(byDayMap);
		const byWeek = mapBuckets(byWeekMap);
		const byMonth = mapBuckets(byMonthMap);

		const dailyTrendKeys = getRollingBusinessDateKeys(30, now, businessTimezone);
		const lineTrend = dailyTrendKeys.map((key) => {
			const bucket = byDayMap.get(key);
			return {
				key,
				revenue: toAmount(bucket?.revenue || 0),
				orderCount: bucket?.orderIds.size || 0
			};
		});

		const soldByTier30Map = new Map<string, number>(
			recentSoldByTier.map((row) => [row.categoryId, Number(row._sum.quantity || 0)])
		);
		const velocityRows: TierVelocityRow[] = tierCatalog
			.map((tier) => {
				const available = Number(tier._count.accounts || 0);
				const soldLast30Days = Number(soldByTier30Map.get(tier.id) || 0);
				const dailyVelocity = soldLast30Days / 30;
				const daysToSellOut =
					dailyVelocity > 0 ? Math.round((available / dailyVelocity) * 10) / 10 : null;
				const rollingSellThroughRate =
					soldLast30Days + available > 0
						? Math.round((soldLast30Days / (soldLast30Days + available)) * 1000) / 10
						: 0;
				const stagnant = soldLast30Days === 0 && available > 0;

				return {
					tierId: tier.id,
					tierName: tier.name,
					platformName: tier.parent?.name || 'Unknown platform',
					available,
					soldLast30Days,
					rollingSellThroughRate,
					daysToSellOut,
					stagnant
				};
			})
			.sort((a, b) => {
				if (a.stagnant !== b.stagnant) return a.stagnant ? -1 : 1;
				return a.daysToSellOut === null
					? 1
					: b.daysToSellOut === null
						? -1
						: a.daysToSellOut - b.daysToSellOut;
			});

		const stagnantTiers = velocityRows.filter((row) => row.stagnant).slice(0, 12);
		const averageSellThroughRate =
			velocityRows.length > 0
				? Math.round(
						(velocityRows.reduce((sum, row) => sum + row.rollingSellThroughRate, 0) /
							velocityRows.length) *
							10
					) / 10
				: 0;
		const daysToSellOutValues = velocityRows
			.map((row) => row.daysToSellOut)
			.filter((value): value is number => typeof value === 'number');
		const averageDaysToSellOut =
			daysToSellOutValues.length > 0
				? Math.round(
						(daysToSellOutValues.reduce((sum, value) => sum + value, 0) /
							daysToSellOutValues.length) *
							10
					) / 10
				: null;

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

		const visibleIntegrityChecks = revenueVisible
			? integrityChecks
			: integrityChecks.filter((check) => check.key === 'orders_total');
		const integrityMismatches = visibleIntegrityChecks.filter((check) => !check.ok);

		const paidVsFailedDenominator = paidOrderCount + cancelledFailedOrderCount;
		const paidConversionRate =
			paidVsFailedDenominator > 0
				? Math.round((paidOrderCount / paidVsFailedDenominator) * 1000) / 10
				: 0;

		const topCategories = revenueByTier.slice(0, 5).map((row) => ({
			name: `${row.platformName} / ${row.name}`,
			revenue: row.revenue,
			unitsSold: row.unitsSold,
			orderCount: row.orderCount
		}));

		const stats = {
			timezone: businessTimezone,
			advancedAnalyticsEnabled: featureFlags.adminAdvancedAnalytics,
			totalRevenue: revenueVisible ? Number(orderStatsSnapshot.total_revenue || 0) : 0,
			revenueChange: revenueVisible
				? ((Number(thisMonthRevenue._sum.totalAmount || 0) -
						Number(lastMonthRevenue._sum.totalAmount || 0)) /
						Number(lastMonthRevenue._sum.totalAmount || 1)) *
					100
				: 0,
			totalOrders: orderStatsSnapshot.total_orders,
			ordersChange: ((thisMonthOrders - lastMonthOrders) / (lastMonthOrders || 1)) * 100,
			totalCustomers,
			customersChange:
				((thisMonthCustomers - lastMonthCustomers) / (lastMonthCustomers || 1)) * 100,
			accountsSold,
			accountsChange: ((thisMonthAccounts - lastMonthAccounts) / (lastMonthAccounts || 1)) * 100,
			activeAffiliates: affiliateStats._count.id || 0,
			totalReferrals: affiliateStats._sum.totalReferrals || 0,
			affiliateSales: revenueVisible ? Number(affiliateStats._sum.totalSales || 0) : 0,
			totalCommissions: revenueVisible ? Number(affiliateStats._sum.totalCommission || 0) : 0,
			totalAccounts,
			availableAccounts: inventorySnapshot.total_available,
			soldAccounts,
			pendingAccounts,
			topCategories: revenueVisible
				? topCategories
				: topCategories.map((row) => ({ ...row, revenue: 0 })),
			revenueBreakdown: {
				byPlatform: revenueVisible ? revenueByPlatform : [],
				byTier: revenueVisible ? revenueByTier : [],
				byDay: revenueVisible ? byDay : [],
				byWeek: revenueVisible ? byWeek : [],
				byMonth: revenueVisible ? byMonth : [],
				lineTrend: revenueVisible ? lineTrend : lineTrend.map((point) => ({ ...point, revenue: 0 }))
			},
			salesPerformance: {
				topTiers: revenueVisible ? revenueByTier.slice(0, 5) : [],
				topPlatforms: revenueVisible ? revenueByPlatform.slice(0, 5) : [],
				paidOrderCount,
				cancelledFailedOrderCount,
				paidConversionRate
			},
			stockVelocity: featureFlags.adminAdvancedAnalytics
				? {
						tiers: velocityRows.slice(0, 20),
						stagnantTiers,
						averageSellThroughRate,
						averageDaysToSellOut
					}
				: {
						tiers: [],
						stagnantTiers: [],
						averageSellThroughRate: 0,
						averageDaysToSellOut: null
					}
		};

		return {
			stats,
			canViewRevenue: revenueVisible,
			integrity: {
				checkedAt: new Date().toISOString(),
				ok: integrityMismatches.length === 0,
				checks: visibleIntegrityChecks,
				mismatches: integrityMismatches
			}
		};
	} catch (error) {
		console.error('Error loading analytics:', error);
		return { stats: {} };
	}
};
