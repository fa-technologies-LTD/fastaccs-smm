import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const user = locals.user;

		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Fetch all dashboard data in parallel with optimized queries
		const [orders, affiliateProgram, wallet, walletTransactions, purchases] = await Promise.all([
			// Orders - only fetch necessary fields
			prisma.order.findMany({
				where: {
					userId: user.id
				},
				select: {
					id: true,
					orderNumber: true,
					totalAmount: true,
					status: true,
					paymentStatus: true,
					deliveryStatus: true,
					createdAt: true,
					orderItems: {
						select: {
							id: true,
							productName: true,
							quantity: true,
							unitPrice: true,
							totalPrice: true,
							allocationStatus: true
						}
					}
				},
				orderBy: { createdAt: 'desc' },
				take: 50
			}),

			// Affiliate stats
			prisma.affiliateProgram.findFirst({
				where: { userId: user.id },
				select: {
					id: true,
					affiliateCode: true,
					commissionRate: true,
					totalReferrals: true,
					totalSales: true,
					totalCommission: true,
					totalPaid: true,
					status: true
				}
			}),

			// Wallet balance
			prisma.wallet.findUnique({
				where: { userId: user.id },
				select: {
					balance: true,
					currency: true,
					isActive: true
				}
			}),

			// Wallet transactions
			prisma.walletTransaction.findMany({
				where: { userId: user.id },
				select: {
					id: true,
					type: true,
					amount: true,
					balanceAfter: true,
					description: true,
					status: true,
					createdAt: true
				},
				orderBy: { createdAt: 'desc' },
				take: 20
			}),

			// Purchases (orders with allocated or delivered accounts)
			prisma.order.findMany({
				where: {
					userId: user.id,
					status: { in: ['paid', 'completed'] },
					orderItems: {
						some: {
							accounts: {
								some: {
									status: { in: ['allocated', 'delivered'] }
								}
							}
						}
					}
				},
				select: {
					id: true,
					orderNumber: true,
					createdAt: true,
					deliveredAt: true,
					orderItems: {
						select: {
							id: true,
							productName: true,
							productCategory: true,
							quantity: true,
							category: {
								select: {
									name: true
								}
							},
							accounts: {
								where: {
									status: { in: ['allocated', 'delivered'] }
								},
								select: {
									id: true,
									platform: true,
									linkUrl: true,
									username: true,
									password: true,
									email: true,
									emailPassword: true,
									twoFa: true,
									followers: true,
									following: true,
									postsCount: true,
									deliveryNotes: true
								}
							}
						}
					}
				},
				orderBy: { createdAt: 'desc' }
			})
		]);

		// Transform purchases data
		const purchasesFormatted = purchases.flatMap((order) =>
			order.orderItems.map((item) => ({
				orderId: order.id,
				orderNumber: order.orderNumber,
				orderDate: order.createdAt,
				deliveredAt: order.deliveredAt,
				categoryName: item.category.name,
				platform: item.productCategory || item.category.name,
				quantity: item.quantity,
				accounts: item.accounts
			}))
		);

		return json({
			success: true,
			data: {
				orders,
				affiliateData: affiliateProgram,
				walletBalance: wallet?.balance || 0,
				walletCurrency: wallet?.currency || 'NGN',
				walletTransactions,
				purchases: purchasesFormatted
			}
		});
	} catch (error) {
		console.error('Dashboard API error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to load dashboard data'
			},
			{ status: 500 }
		);
	}
};
