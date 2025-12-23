import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async () => {
	try {
		// Get all users with their order and wallet info
		const usersRaw = await prisma.user.findMany({
			include: {
				orders: true,
				wallet: true
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Convert Decimal types to numbers and aggregate stats
		const users = usersRaw.map((user) => ({
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			phone: user.phone,
			userType: user.userType,
			isActive: user.isActive,
			isAffiliateEnabled: user.isAffiliateEnabled,
			emailVerified: user.emailVerified,
			registeredAt: user.registeredAt,
			lastLogin: user.lastLogin,
			createdAt: user.createdAt,
			orderCount: user.orders.length,
			totalSpent: user.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
			walletBalance: user.wallet ? Number(user.wallet.balance) : 0
		}));

		// Calculate stats from users data
		const stats = {
			totalUsers: users.length,
			registeredUsers: users.filter((u) => u.userType === 'REGISTERED').length,
			guestUsers: users.filter((u) => u.userType === 'GUEST').length,
			affiliates: users.filter((u) => u.isAffiliateEnabled).length,
			activeUsers: users.filter((u) => u.isActive).length,
			totalRevenue: users.reduce((sum, user) => sum + user.totalSpent, 0)
		};

		return {
			users,
			stats
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
				activeUsers: 0,
				totalRevenue: 0
			}
		};
	}
};
