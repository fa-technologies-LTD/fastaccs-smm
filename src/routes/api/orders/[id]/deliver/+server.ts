import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';
import type { Decimal } from '@prisma/client/runtime/library';

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

// POST /api/orders/[id]/deliver - Send allocated accounts to customer
export async function POST({ params, request }) {
	try {
		const orderId = params.id;
		// Currently only email delivery is supported
		await request.json(); // Parse request body but don't extract deliveryMethod since it's not used

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
		const emailContent = generateAccountDeliveryEmail(order);
		const customerEmail = order.guestEmail;

		if (!customerEmail) {
			return json({ error: 'No customer email found' }, { status: 400 });
		}

		// Send email with account details
		const emailResponse = await fetch('/api/send-email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				to: customerEmail,
				subject: `Your FastAccs Order ${order.orderNumber} - Account Details`,
				content: emailContent
			})
		});

		const emailResult = await emailResponse.json();

		if (!emailResponse.ok) {
			return json({ error: 'Failed to send email: ' + emailResult.error }, { status: 500 });
		}

		// Update order delivery status
		await prisma.order.update({
			where: { id: orderId },
			data: {
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

		return json({
			success: true,
			message: 'Accounts successfully delivered to customer',
			messageId: emailResult.messageId,
			accountsDelivered: totalAllocated
		});
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

/**
 * Generate formatted email content with account details
 */
function generateAccountDeliveryEmail(order: OrderForEmail): string {
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
				if (account.password) content += `- Password: ${account.password}\n`;
				if (account.email) content += `- Email: ${account.email}\n`;
				if (account.emailPassword) content += `- Email Password: ${account.emailPassword}\n`;
				if (account.twoFa) content += `- 2FA Code: ${account.twoFa}\n`;
				if (account.linkUrl) content += `- Login Link: ${account.linkUrl}\n`;
				if (account.followers !== null) content += `- Followers: ${account.followers}\n`;
				if (account.ageMonths) content += `- Account Age: ${account.ageMonths} months\n`;
			});

			content += `\n`;
		}
	});

	content += `**Important Notes:**
- Please change passwords immediately after receiving accounts
- Keep your account details secure and private  
- Contact support if you face any issues

**Quick Links:**
- View Order Details: https://fastaccs.com/dashboard
- Browse More Accounts: https://fastaccs.com/platforms
- Contact Support: https://fastaccs.com/support

**Support:**
For any questions or issues, please contact our support team.

Thank you for choosing FastAccs!

**The FastAccs Team**`;

	return content;
}
