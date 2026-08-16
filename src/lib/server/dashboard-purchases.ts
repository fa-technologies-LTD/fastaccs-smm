import { prisma } from '$lib/prisma';
import {
	DEFAULT_LOGIN_GUIDE_LABEL,
	DEFAULT_LOGIN_GUIDE_URL,
	getTierDeliveryConfig
} from '$lib/helpers/tier-delivery-config';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import {
	CONFIRMED_PAYMENT_STATUSES,
	getBuyerVisibleAccounts
} from '$lib/helpers/buyer-order-visibility';

export const DASHBOARD_PURCHASES_PAGE_SIZE = 10;

export async function getDashboardPurchasesPage(input: {
	userId: string;
	cursor?: string | null;
	limit?: number;
}) {
	const limit = Math.max(1, Math.min(25, Math.floor(input.limit || DASHBOARD_PURCHASES_PAGE_SIZE)));
	const purchasedAccountStatuses = [...getAllocatedLikeAccountStatuses(), 'delivered'];
	const rows = await prisma.order.findMany({
		where: {
			userId: input.userId,
			AND: [
				{
					status: { in: ['paid', 'processing', 'completed'] },
					paymentStatus: { in: [...CONFIRMED_PAYMENT_STATUSES] }
				},
				{
					OR: [
						{
							orderItems: {
								some: { accounts: { some: { status: { in: purchasedAccountStatuses } } } }
							}
						},
						{ deliveryMethod: 'whatsapp' }
					]
				}
			]
		},
		select: {
			id: true,
			orderNumber: true,
			status: true,
			paymentStatus: true,
			deliveryStatus: true,
			createdAt: true,
			deliveredAt: true,
			orderItems: {
				select: {
					id: true,
					productName: true,
					productCategory: true,
					quantity: true,
					category: { select: { name: true, metadata: true } },
					accounts: {
						where: { status: { in: purchasedAccountStatuses } },
						select: {
							id: true,
							status: true,
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
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
		...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
		take: limit + 1
	});

	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;
	const purchases = pageRows.flatMap((order) =>
		order.orderItems
			.filter((item) => item.productCategory !== 'boosting_service')
			.map((item) => {
				const deliveryConfig = getTierDeliveryConfig(item.category.metadata);
				return {
					orderId: order.id,
					orderNumber: order.orderNumber,
					status: order.status,
					paymentStatus: order.paymentStatus,
					deliveryStatus: order.deliveryStatus,
					orderDate: order.createdAt,
					deliveredAt: order.deliveredAt,
					categoryName: item.category.name,
					platform: item.productCategory || item.category.name,
					quantity: item.quantity,
					accounts: getBuyerVisibleAccounts(order, item),
					deliveryMode: deliveryConfig.mode,
					loginGuideUrl: deliveryConfig.loginGuideUrl || DEFAULT_LOGIN_GUIDE_URL,
					loginGuideLabel: deliveryConfig.loginGuideLabel || DEFAULT_LOGIN_GUIDE_LABEL
				};
			})
	);

	return {
		purchases,
		nextCursor: hasMore ? pageRows.at(-1)?.id || null : null
	};
}
