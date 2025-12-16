import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Verify admin access
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		throw error(403, 'Unauthorized');
	}

	const { id } = params;

	try {
		// Get affiliate user with program details
		const affiliate = await prisma.user.findUnique({
			where: { id },
			include: {
				affiliatePrograms: true
			}
		});

		if (!affiliate) {
			throw error(404, 'Affiliate not found');
		}

		if (!affiliate.isAffiliateEnabled || affiliate.affiliatePrograms.length === 0) {
			throw error(404, 'User is not an active affiliate');
		}

		const affiliateProgram = affiliate.affiliatePrograms[0];

		// Get all orders using this affiliate's code
		const orders = await prisma.order.findMany({
			where: {
				affiliateCode: affiliateProgram.affiliateCode
			},
			include: {
				user: {
					select: {
						email: true,
						fullName: true
					}
				},
				orderItems: {
					include: {
						category: {
							select: {
								name: true
							}
						}
					}
				}
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Get payout history
		const payouts = await prisma.commissionPayout.findMany({
			where: { affiliateProgramId: affiliateProgram.id },
			orderBy: { payoutDate: 'desc' }
		});

		// Calculate monthly breakdown
		const monthlyStats = orders.reduce(
			(acc, order) => {
				const month = new Date(order.createdAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short'
				});

				if (!acc[month]) {
					acc[month] = {
						month,
						orders: 0,
						sales: 0,
						commission: 0
					};
				}

				const orderTotal = Number(order.totalAmount);
				const commission = (orderTotal * Number(affiliateProgram.commissionRate)) / 100;

				acc[month].orders += 1;
				acc[month].sales += orderTotal;
				acc[month].commission += commission;

				return acc;
			},
			{} as Record<string, { month: string; orders: number; sales: number; commission: number }>
		);

		const monthlyBreakdown = Object.values(monthlyStats).reverse();

		// Calculate recent performance (last 30 days)
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const recentOrders = orders.filter((order) => new Date(order.createdAt) >= thirtyDaysAgo);
		const recentSales = recentOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
		const recentCommission = (recentSales * Number(affiliateProgram.commissionRate)) / 100;

		return {
			affiliate: {
				id: affiliate.id,
				fullName: affiliate.fullName,
				email: affiliate.email,
				avatarUrl: affiliate.avatarUrl,
				isAffiliateEnabled: affiliate.isAffiliateEnabled,
				createdAt: affiliate.createdAt
			},
			program: {
				id: affiliateProgram.id,
				affiliateCode: affiliateProgram.affiliateCode,
				commissionRate: Number(affiliateProgram.commissionRate),
				totalReferrals: affiliateProgram.totalReferrals,
				totalSales: Number(affiliateProgram.totalSales),
				totalCommission: Number(affiliateProgram.totalCommission),
				totalPaid: Number(affiliateProgram.totalPaid || 0),
				status: affiliateProgram.status,
				createdAt: affiliateProgram.createdAt
			},
			payouts: payouts.map((p) => ({
				id: p.id,
				amount: Number(p.amount),
				payoutMethod: p.payoutMethod,
				payoutReference: p.payoutReference,
				payoutDate: p.payoutDate,
				notes: p.notes,
				processedBy: p.processedBy,
				createdAt: p.createdAt
			})),
			orders: orders.map((order) => ({
				id: order.id,
				orderNumber: order.orderNumber,
				customerEmail: order.user?.email || order.guestEmail,
				customerName: order.user?.fullName || 'Guest',
				totalAmount: Number(order.totalAmount),
				status: order.status,
				createdAt: order.createdAt,
				itemCount: order.orderItems.length,
				commission: (Number(order.totalAmount) * Number(affiliateProgram.commissionRate)) / 100
			})),
			monthlyBreakdown,
			recentStats: {
				orders: recentOrders.length,
				sales: recentSales,
				commission: recentCommission
			}
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error loading affiliate details:', err);
		throw error(500, 'Failed to load affiliate details');
	}
};
