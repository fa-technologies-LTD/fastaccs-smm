import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { prisma } from '$lib/prisma';
import {
	DEFAULT_LOGIN_GUIDE_LABEL,
	DEFAULT_LOGIN_GUIDE_URL,
	getTierDeliveryConfig
} from '$lib/helpers/tier-delivery-config';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import { getAffiliateDashboardState } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const user = locals.user;
		const purchasedAccountStatuses = [...getAllocatedLikeAccountStatuses(), 'delivered'];

		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Fetch all dashboard data in parallel with optimized queries
		const [orders, affiliateData, wallet, walletTransactions, purchases] = await Promise.all([
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
							categoryId: true,
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

			// Affiliate dashboard state
			getAffiliateDashboardState(user.id),

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
					OR: [
						{
							orderItems: {
								some: {
							accounts: {
								some: {
									status: { in: purchasedAccountStatuses }
								}
							}
								}
							}
						},
						{
							deliveryMethod: 'whatsapp',
							paymentStatus: 'paid'
						}
					]
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
									name: true,
									metadata: true
								}
							},
							accounts: {
								where: {
									status: { in: purchasedAccountStatuses }
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
									credentialExtras: true,
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
			order.orderItems.map((item) => {
				const deliveryConfig = getTierDeliveryConfig(item.category.metadata);
				return {
					orderId: order.id,
					orderNumber: order.orderNumber,
					orderDate: order.createdAt,
					deliveredAt: order.deliveredAt,
					categoryName: item.category.name,
					platform: item.productCategory || item.category.name,
					quantity: item.quantity,
					accounts: item.accounts,
					deliveryMode: deliveryConfig.mode,
					loginGuideUrl: deliveryConfig.loginGuideUrl || DEFAULT_LOGIN_GUIDE_URL,
					loginGuideLabel: deliveryConfig.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL
				};
			})
		);

		return json({
			success: true,
			data: {
				orders,
				affiliateData,
				walletBalance: wallet?.balance || 0,
				walletCurrency: wallet?.currency || 'NGN',
				walletTransactions,
				purchases: purchasesFormatted
			}
		});
	} catch (error) {
		const traceId = randomUUID();
		console.error('Dashboard API error:', { traceId, error });
		return json(
			{
				success: false,
				error: `Failed to load dashboard data. Reference: ${traceId}`
			},
			{ status: 500 }
		);
	}
};
