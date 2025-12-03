import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = locals.user?.id;

		if (!userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Fetch all orders with delivered accounts for the user
		const orders = await prisma.order.findMany({
			where: {
				userId: userId,
				status: 'completed',
				deliveryStatus: 'delivered'
			},
			include: {
				orderItems: {
					include: {
						category: true,
						accounts: true
					}
				}
			},
			orderBy: {
				deliveredAt: 'desc'
			}
		});

		// Transform the data for easier consumption
		const purchases = orders.flatMap((order) =>
			order.orderItems.map((item) => ({
				orderId: order.id,
				orderNumber: order.orderNumber,
				orderDate: order.createdAt,
				deliveredAt: order.deliveredAt,
				categoryName: item.category.name,
				platform: item.productCategory || item.category.name,
				quantity: item.quantity,
				accounts: item.accounts.map((account) => ({
					id: account.id,
					platform: account.platform,
					linkUrl: account.linkUrl,
					username: account.username,
					password: account.password,
					email: account.email,
					emailPassword: account.emailPassword,
					twoFa: account.twoFa,
					twoFactorEnabled: account.twoFactorEnabled,
					easyLoginEnabled: account.easyLoginEnabled,
					followers: account.followers,
					following: account.following,
					postsCount: account.postsCount,
					deliveredAt: account.deliveredAt,
					deliveryNotes: account.deliveryNotes
				}))
			}))
		);

		return json({ purchases });
	} catch (error) {
		console.error('Failed to fetch purchases:', error);
		return json({ error: 'Failed to fetch purchases' }, { status: 500 });
	}
};
