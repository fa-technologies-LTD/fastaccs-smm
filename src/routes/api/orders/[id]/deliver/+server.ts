import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { getAllocatedLikeAccountStatuses } from '$lib/helpers/account-status';
import {
	ACCOUNT_READY_EMAIL_SUBJECT,
	buildAccountReadyEmailBody
} from '$lib/helpers/account-ready-email';
import { isOrderPaymentConfirmed } from '$lib/helpers/buyer-order-visibility';
import { recordOrderEventBestEffort } from '$lib/services/order-events';

interface DeliveryPayload {
	deliveryMethod?: unknown;
}

const SUPPORTED_DELIVERY_METHODS = new Set(['email', 'whatsapp', 'telegram', 'dashboard']);

function getBaseUrl(): string {
	const configuredBaseUrl = (env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
	if (configuredBaseUrl) {
		return configuredBaseUrl.replace(/\/+$/, '');
	}
	return 'https://smm.fastaccs.com';
}

// POST /api/orders/[id]/deliver - Send allocated accounts to customer
export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const orderId = params.id;
		const payload = (await request.json().catch(() => ({}))) as DeliveryPayload;
		const requestedDeliveryMethod =
			typeof payload.deliveryMethod === 'string'
				? payload.deliveryMethod.trim().toLowerCase()
				: 'email';
		if (!SUPPORTED_DELIVERY_METHODS.has(requestedDeliveryMethod)) {
			return json({ error: 'Unsupported delivery method' }, { status: 400 });
		}
		const fallbackToEmail = requestedDeliveryMethod !== 'email';

		// Get order with allocated accounts
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: {
					include: {
						accounts: {
							where: {
								status: { in: getAllocatedLikeAccountStatuses() }
							},
							select: { id: true }
						}
					}
				}
			}
		});

		if (!order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		if (!isOrderPaymentConfirmed(order)) {
			return json({ error: 'Payment must be confirmed before delivery' }, { status: 400 });
		}

		if (order.status !== 'completed') {
			return json({ error: 'Order must be completed before delivery' }, { status: 400 });
		}

		// Check if accounts are allocated
		const totalAllocated = order.orderItems.reduce((sum, item) => sum + item.accounts.length, 0);
		if (totalAllocated === 0) {
			return json({ error: 'No accounts allocated for this order' }, { status: 400 });
		}

		// Only the authenticated dashboard exposes account credentials.
		const baseUrl = getBaseUrl();
		const emailContent = buildAccountReadyEmailBody(order);
		const customerEmail = order.guestEmail;

		if (!customerEmail) {
			return json({ error: 'No customer email found' }, { status: 400 });
		}

		// Notify without fetching or sending any login details.
		const emailResult = await sendEmail({
			to: customerEmail,
			subject: ACCOUNT_READY_EMAIL_SUBJECT,
			preheader: 'Your account details are ready in your dashboard.',
			body: emailContent,
			ctaText: 'Open your dashboard',
			ctaUrl: `${baseUrl}/dashboard?tab=purchases`,
			notificationType: 'order_delivery',
			referenceId: orderId,
			userId: order.userId || null
		});

		if (!emailResult.success) {
			return json({ error: 'Failed to send email: ' + emailResult.error }, { status: 500 });
		}

		// Update order delivery status
		await prisma.order.update({
			where: { id: orderId },
			data: {
				deliveryMethod: requestedDeliveryMethod,
				deliveryStatus: 'delivered',
				deliveredAt: new Date()
			}
		});

		// Update account status to delivered
		const accountIds = order.orderItems.flatMap((item) => item.accounts.map((acc) => acc.id));
		await prisma.account.updateMany({
			where: { id: { in: accountIds } },
			data: {
				status: 'delivered',
				deliveredAt: new Date()
			}
		});

		invalidateAdminStatsCache();
		recordOrderEventBestEffort({
			orderId,
			type: 'item_delivered',
			source: 'admin.delivery',
			actorUserId: locals.user.id,
			description: `${totalAllocated} account${totalAllocated === 1 ? '' : 's'} delivered`,
			idempotencyKey: `delivery:accounts:${orderId}`,
			metadata: { accountsDelivered: totalAllocated, deliveryMethod: requestedDeliveryMethod }
		});

		return json({
			success: true,
			message: 'Accounts successfully delivered to customer',
			messageId: emailResult.messageId,
			accountsDelivered: totalAllocated,
			deliveryMethod: requestedDeliveryMethod,
			deliveryFallback: fallbackToEmail ? 'email' : null
		});
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
