import type { PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';

const PUBLIC_ORDER_BASE_URL = 'https://smm.fastaccs.com/order';

/**
 * Send the buyer one durable completion update when every Boosting item in the order is done.
 * Both the in-app notification and email are idempotent enough for worker/admin replays.
 * Delivery notification failures never roll back a completed supplier order.
 */
export async function notifyBoostingOrderCompleted(
	orderId: string,
	database: PrismaClient = prisma
): Promise<void> {
	try {
		const order = await database.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				orderNumber: true,
				guestEmail: true,
				userId: true,
				user: { select: { email: true, fullName: true } },
				orderItems: {
					where: { boostTargetUrl: { not: null } },
					select: { productName: true, boostFulfillmentStatus: true }
				}
			}
		});
		if (
			!order ||
			!order.orderItems.length ||
			order.orderItems.some((item) => item.boostFulfillmentStatus !== 'completed')
		)
			return;

		if (order.userId) {
			const existingNotification = await database.notification.findFirst({
				where: { userId: order.userId, orderId: order.id, type: 'order_delivered' },
				select: { id: true }
			});
			if (!existingNotification) {
				await database.notification.create({
					data: {
						userId: order.userId,
						type: 'order_delivered',
						title: 'Your Boosting order is complete',
						message: `${order.orderNumber} has finished. Open the order to review it or report an issue.`,
						orderId: order.id
					}
				});
			}
		}

		const email = String(order.guestEmail || order.user?.email || '')
			.trim()
			.toLowerCase();
		if (!email) return;
		const referenceId = `boosting-complete:${order.id}`;
		const existingEmail = await database.emailNotification.findFirst({
			where: {
				notificationType: 'order_delivery',
				referenceId,
				status: { in: ['pending', 'sent'] }
			},
			select: { id: true }
		});
		if (existingEmail) return;

		const firstName =
			String(order.user?.fullName || '')
				.trim()
				.split(/\s+/)[0] || 'there';
		const services = order.orderItems.map((item) => `- ${item.productName}`).join('\n');
		await sendEmail({
			to: email,
			subject: `Your Boosting order ${order.orderNumber} is complete`,
			preheader: 'Your engagement order has finished.',
			body: `Hi ${firstName},\n\nYour Boosting order is complete.\n\n${services}\n\nOpen the order if you need to review the delivery or report an issue.`,
			ctaText: 'View your order',
			ctaUrl: `${PUBLIC_ORDER_BASE_URL}/${encodeURIComponent(order.id)}`,
			userId: order.userId,
			notificationType: 'order_delivery',
			referenceId
		});
	} catch (error) {
		console.error(
			'[boosting.notifications] completion update failed:',
			error instanceof Error ? error.message : 'unknown error'
		);
	}
}
