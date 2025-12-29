import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		// Verify admin access
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return { stats: {} };
		}

		// Get date ranges
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

		// Total Revenue
		const revenueResult = await prisma.order.aggregate({
			where: { status: 'completed' },
			_sum: { totalAmount: true }
		});

		const lastMonthRevenue = await prisma.order.aggregate({
			where: {
				status: 'completed',
				createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }
			},
			_sum: { totalAmount: true }
		});

		const thisMonthRevenue = await prisma.order.aggregate({
			where: {
				status: 'completed',
				createdAt: { gte: startOfMonth }
			},
			_sum: { totalAmount: true }
		});

		// Total Orders
		const totalOrders = await prisma.order.count();
		const lastMonthOrders = await prisma.order.count({
			where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }
		});
		const thisMonthOrders = await prisma.order.count({
			where: { createdAt: { gte: startOfMonth } }
		});

		// Total Customers
		const totalCustomers = await prisma.user.count({
			where: { userType: { in: ['REGISTERED', 'CONVERTED'] } }
		});
		const lastMonthCustomers = await prisma.user.count({
			where: {
				userType: { in: ['REGISTERED', 'CONVERTED'] },
				createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }
			}
		});
		const thisMonthCustomers = await prisma.user.count({
			where: {
				userType: { in: ['REGISTERED', 'CONVERTED'] },
				createdAt: { gte: startOfMonth }
			}
		});

		// Accounts Sold (delivered status)
		const accountsSold = await prisma.account.count({
			where: { status: 'delivered' }
		});
		const lastMonthAccounts = await prisma.account.count({
			where: {
				status: 'delivered',
				deliveredAt: { gte: startOfLastMonth, lte: endOfLastMonth }
			}
		});
		const thisMonthAccounts = await prisma.account.count({
			where: {
				status: 'delivered',
				deliveredAt: { gte: startOfMonth }
			}
		});

		// Wallet Stats
		const walletStats = await prisma.wallet.aggregate({
			_sum: { balance: true },
			_count: { id: true }
		});

		const deposits = await prisma.walletTransaction.aggregate({
			where: { type: 'deposit', status: 'completed' },
			_sum: { amount: true }
		});

		const debits = await prisma.walletTransaction.aggregate({
			where: { type: 'debit', status: 'completed' },
			_sum: { amount: true }
		});

		// Affiliate Stats
		const affiliateStats = await prisma.affiliateProgram.aggregate({
			_sum: { totalReferrals: true, totalSales: true, totalCommission: true },
			_count: { id: true }
		});

		// Inventory Stats
		const totalAccounts = await prisma.account.count();
		const availableAccounts = await prisma.account.count({
			where: { status: 'available' }
		});
		const soldAccounts = await prisma.account.count({
			where: { status: 'delivered' }
		});
		const pendingAccounts = await prisma.account.count({
			where: { status: { in: ['allocated', 'assigned'] } }
		});

		// Top Categories
		const topCategories = await prisma.orderItem.groupBy({
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

		return {
			stats: {
				totalRevenue: Number(revenueResult._sum.totalAmount || 0),
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

				totalWalletBalance: Number(walletStats._sum.balance || 0),
				totalDeposits: Number(deposits._sum.amount || 0),
				totalDebits: Number(debits._sum.amount || 0),
				activeWallets: walletStats._count.id || 0,

				activeAffiliates: affiliateStats._count.id || 0,
				totalReferrals: affiliateStats._sum.totalReferrals || 0,
				affiliateSales: Number(affiliateStats._sum.totalSales || 0),
				totalCommissions: Number(affiliateStats._sum.totalCommission || 0),

				totalAccounts,
				availableAccounts,
				soldAccounts,
				pendingAccounts,

				topCategories: categoriesWithNames
			}
		};
	} catch (error) {
		console.error('Error loading analytics:', error);
		return { stats: {} };
	}
};
