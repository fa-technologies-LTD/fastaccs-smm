import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { isRevenueOrder } from '$lib/helpers/order-revenue';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const revenueVisible = canViewRevenue(locals);
		const inactiveCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

		// Get all users with their order and wallet info
		const usersRaw = await prisma.user.findMany({
			include: {
				orders: {
					select: {
						status: true,
						paymentStatus: true,
						totalAmount: true
					}
				},
				wallet: true
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Convert Decimal types to numbers and aggregate stats
		const users = usersRaw.map((user) => {
			const successfulOrders = user.orders.filter((order) =>
				isRevenueOrder({
					status: order.status,
					paymentStatus: order.paymentStatus
				})
			);
			const lastSeenAt = user.lastSeenAt || user.lastLogin || user.registeredAt;

			return {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
				phone: user.phone,
				userType: user.userType,
				isActive: user.isActive,
				isInactive: lastSeenAt < inactiveCutoff,
				isPayingCustomer: successfulOrders.length > 0,
				isAffiliateEnabled: user.isAffiliateEnabled,
				emailVerified: user.emailVerified,
				registeredAt: user.registeredAt,
				lastLogin: user.lastLogin,
				lastSeenAt,
				createdAt: user.createdAt,
				orderCount: user.orders.length,
				successfulOrderCount: successfulOrders.length,
				totalSpent: revenueVisible
					? successfulOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
					: 0,
				storeCreditBalance: user.wallet ? Number(user.wallet.balance) : 0,
				walletBalance: user.wallet ? Number(user.wallet.balance) : 0
			};
		});

		// Calculate stats from users data
		const stats = {
			totalUsers: users.length,
			registeredUsers: users.filter((u) => u.userType === 'REGISTERED').length,
			guestUsers: users.filter((u) => u.userType === 'GUEST').length,
			affiliates: users.filter((u) => u.isAffiliateEnabled).length,
			payingCustomers: users.filter((u) => u.isPayingCustomer).length,
			activeUsers: users.filter((u) => !u.isInactive).length,
			inactiveUsers: users.filter((u) => u.isInactive).length,
			suspendedUsers: users.filter((u) => !u.isActive).length,
			totalRevenue: revenueVisible ? users.reduce((sum, user) => sum + user.totalSpent, 0) : 0
		};

		return {
			users,
			stats,
			canViewRevenue: revenueVisible
		};
	} catch (error) {
		console.error('Error loading users:', error);
		return {
			users: [],
			stats: {
				totalUsers: 0,
				registeredUsers: 0,
				guestUsers: 0,
				affiliates: 0,
				payingCustomers: 0,
				activeUsers: 0,
				inactiveUsers: 0,
				suspendedUsers: 0,
				totalRevenue: 0
			},
			canViewRevenue: false
		};
	}
};
