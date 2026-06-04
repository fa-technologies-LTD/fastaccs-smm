import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import {
	CONFIRMED_PAYMENT_STATUSES,
	getBuyerVisibleAccounts
} from '$lib/helpers/buyer-order-visibility';
import { getTierDeliveryConfig } from '$lib/helpers/tier-delivery-config';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = locals.user?.id;
		const purchasedAccountStatuses = [...getAllocatedLikeAccountStatuses(), 'delivered'];

		if (!userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Fetch all orders with allocated or delivered accounts for the user
		const orders = await prisma.order.findMany({
			where: {
				userId: userId,
				AND: [
					{
						status: { in: ['paid', 'processing', 'completed'] },
						paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
					},
					{
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
								deliveryMethod: 'whatsapp'
							}
						]
					}
				]
			},
			include: {
				orderItems: {
					include: {
						category: true,
						accounts: {
							where: {
								status: { in: purchasedAccountStatuses }
							}
						}
					}
				}
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		// Transform the data for easier consumption
		const purchases = orders.flatMap((order) =>
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
					accounts: getBuyerVisibleAccounts(order, item).map((account) => ({
						id: account.id,
						platform: account.platform,
						linkUrl: account.linkUrl,
						username: account.username,
						password: account.password,
						email: account.email,
						emailPassword: account.emailPassword,
						twoFa: account.twoFa,
						credentialExtras:
							account.credentialExtras && typeof account.credentialExtras === 'object'
								? account.credentialExtras
								: {},
						twoFactorEnabled: account.twoFactorEnabled,
						easyLoginEnabled: account.easyLoginEnabled,
						followers: account.followers,
						following: account.following,
						postsCount: account.postsCount,
						deliveredAt: account.deliveredAt,
						deliveryNotes: account.deliveryNotes
					})),
					deliveryMode: deliveryConfig.mode
				};
			})
		);

		return json({ purchases });
	} catch (error) {
		console.error('Failed to fetch purchases:', error);
		return json({ error: 'Failed to fetch purchases' }, { status: 500 });
	}
};
