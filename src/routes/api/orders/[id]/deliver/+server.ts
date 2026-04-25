import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import type { Decimal } from '@prisma/client/runtime/library';
import { resolveCredentialField } from '$lib/helpers/credential-links';

// Type definitions for email generation
interface OrderForEmail {
	orderNumber: string;
	createdAt: Date;
	totalAmount: Decimal;
	orderItems: OrderItemForEmail[];
}

interface OrderItemForEmail {
	productName: string;
	accounts: AccountForEmail[];
}

interface AccountForEmail {
	username?: string | null;
	password?: string | null;
	email?: string | null;
	emailPassword?: string | null;
	twoFa?: string | null;
	linkUrl?: string | null;
	followers?: number | null;
	ageMonths?: number | null;
}

interface DeliveryPayload {
	deliveryMethod?: unknown;
}

const SUPPORTED_DELIVERY_METHODS = new Set(['email', 'whatsapp', 'telegram', 'dashboard']);

function getBaseUrl(): string {
	const configuredBaseUrl = (env.PUBLIC_BASE_URL || PUBLIC_BASE_URL || '').trim();
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
			typeof payload.deliveryMethod === 'string' ? payload.deliveryMethod.trim().toLowerCase() : 'email';
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
								status: 'allocated'
							}
						}
					}
				}
			}
		});

		if (!order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		if (order.status !== 'completed') {
			return json({ error: 'Order must be completed before delivery' }, { status: 400 });
		}

		// Check if accounts are allocated
		const totalAllocated = order.orderItems.reduce((sum, item) => sum + item.accounts.length, 0);
		if (totalAllocated === 0) {
			return json({ error: 'No accounts allocated for this order' }, { status: 400 });
		}

		// ✅ FIXED: Generate email content with allocated account details
		const baseUrl = getBaseUrl();
		const emailContent = generateAccountDeliveryEmail(order, baseUrl);
		const customerEmail = order.guestEmail;

		if (!customerEmail) {
			return json({ error: 'No customer email found' }, { status: 400 });
		}

		// Send email with account details
		const emailResult = await sendEmail({
			to: customerEmail,
			subject: `Your FastAccs Order ${order.orderNumber} - Account Details`,
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

/**
 * Generate formatted email content with account details
 */
function generateAccountDeliveryEmail(order: OrderForEmail, baseUrl: string): string {
	const orderItems = order.orderItems;
	let content = `**Dear Customer,**

Thank you for your order with FastAccs! Your accounts are ready.

**Order Details:**
- Order Number: ${order.orderNumber}
- Order Date: ${new Date(order.createdAt).toLocaleDateString()}
- Total Amount: ₦${order.totalAmount}

**Your Account Details:**

`;

	orderItems.forEach((item: OrderItemForEmail) => {
		if (item.accounts.length > 0) {
			content += `**${item.productName}** (${item.accounts.length} account${item.accounts.length > 1 ? 's' : ''})\n`;

			item.accounts.forEach((account: AccountForEmail, accIndex: number) => {
				content += `\nAccount ${accIndex + 1}:\n`;
				if (account.username) content += `- Username: ${account.username}\n`;
				if (account.email) content += `- Email: ${account.email}\n`;
				if (account.linkUrl) {
					const sanitizedLink = resolveCredentialField(account.linkUrl);
					if (sanitizedLink.display) {
						content += `- Login Link: ${sanitizedLink.display}\n`;
					}
				}
				if (account.followers !== null) content += `- Followers: ${account.followers}\n`;
				if (account.ageMonths) content += `- Account Age: ${account.ageMonths} months\n`;
				content += `- Password: Available in your dashboard\n`;
			});

			content += `\n`;
		}
	});

	content += `**Important Security Information:**
- **Account passwords are available in your dashboard for security reasons**
- Please log into your dashboard to access full account credentials
- Change passwords immediately after accessing your accounts
- Keep your account details secure and private  
- Contact support if you face any issues

**Quick Links:**
- Access Passwords & Full Details: ${baseUrl}/dashboard?tab=purchases
- Browse More Accounts: ${baseUrl}/platforms
- Contact Support: ${baseUrl}/support

**Support:**
For any questions or issues, please contact our support team.

Thank you for choosing FastAccs!

**The FastAccs Team**`;

	return content;
}
