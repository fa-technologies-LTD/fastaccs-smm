import { prisma } from '$lib/prisma';
import type { Decimal } from '@prisma/client/runtime/library';
import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { recordCommission } from './affiliate';

// Type definitions
interface AllocationResult {
	orderItemId: string;
	categoryName: string;
	requestedQuantity: number;
	allocatedQuantity: number;
	accountIds: string[];
}

interface DeliveryResult {
	accountsDelivered: number;
	messageId?: string;
	customerEmail: string;
}

interface OrderWithItems {
	id: string;
	orderNumber: string;
	guestEmail: string | null;
	createdAt: Date;
	totalAmount: Decimal;
	status: string;
	orderItems: OrderItemWithAccounts[];
}

interface OrderItemWithAccounts {
	id: string;
	productName: string;
	quantity: number;
	accounts: AccountData[];
}

interface AccountData {
	id: string;
	username: string | null;
	password: string | null;
	email: string | null;
	emailPassword: string | null;
	twoFa: string | null;
	linkUrl: string | null;
	followers: number | null;
	ageMonths: number | null;
}

/**
 * Complete order fulfillment: allocate accounts and deliver to customer
 */
export async function fulfillOrder(orderId: string): Promise<{
	success: boolean;
	allocation?: AllocationResult[];
	delivery?: DeliveryResult;
	error?: string;
}> {
	try {
		// Step 1: Allocate accounts
		const allocationResult = await allocateAccounts(orderId);
		if (!allocationResult.success) {
			return { success: false, error: allocationResult.error };
		}

		// Step 2: Deliver accounts to customer
		const deliveryResult = await deliverAccounts(orderId);

		return {
			success: deliveryResult.success,
			allocation: allocationResult.data,
			delivery: deliveryResult.data,
			error: deliveryResult.error
		};
	} catch (error) {
		console.error('Order fulfillment error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown fulfillment error'
		};
	}
}

/**
 * Allocate accounts to order items
 * Exported for use in payment verification flow
 */
export async function allocateAccountsForOrder(orderId: string) {
	return allocateAccounts(orderId);
}

/**
 * Internal allocation function
 */
async function allocateAccounts(orderId: string) {
	try {
		// Get order with items
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: true
			}
		});

		if (!order) {
			return { success: false, error: 'Order not found' };
		}

		if (order.status === 'completed') {
			return { success: false, error: 'Order already processed' };
		}

		// Process each order item and allocate accounts
		const allocationResults = [];

		for (const item of order.orderItems) {
			// Use the field that exists in current database schema
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const categoryId = (item as any).productId || (item as any).categoryId;

			// Find available accounts for this tier
			const availableAccounts = await prisma.account.findMany({
				where: {
					categoryId: categoryId,
					status: 'available'
				},
				take: item.quantity,
				orderBy: { createdAt: 'asc' } // First in, first allocated
			});

			if (availableAccounts.length < item.quantity) {
				// Not enough accounts available - rollback any previous allocations
				for (const result of allocationResults) {
					await prisma.account.updateMany({
						where: { id: { in: result.accountIds } },
						data: { status: 'available', orderItemId: null }
					});
				}

				return {
					success: false,
					error: `Insufficient accounts available for ${item.productName}. Requested: ${item.quantity}, Available: ${availableAccounts.length}`
				};
			}

			// Allocate accounts to this order item
			const accountIds = availableAccounts.map((acc) => acc.id);
			await prisma.account.updateMany({
				where: { id: { in: accountIds } },
				data: {
					status: 'allocated',
					orderItemId: item.id
				}
			});

			allocationResults.push({
				orderItemId: item.id,
				categoryName: item.productName,
				requestedQuantity: item.quantity,
				allocatedQuantity: availableAccounts.length,
				accountIds
			});
		}

		// Update order status to completed
		await prisma.order.update({
			where: { id: orderId },
			data: {
				status: 'completed',
				updatedAt: new Date()
			}
		});

		// Record affiliate commission if order has affiliate code
		if (order.affiliateCode) {
			const orderTotal = Number(order.totalAmount);
			const commissionResult = await recordCommission(orderId, order.affiliateCode, orderTotal);
			if (commissionResult.success) {
				console.log(
					`Recorded affiliate commission: ₦${commissionResult.commission} for code ${order.affiliateCode}`
				);
			} else {
				console.error('Failed to record commission:', commissionResult.error);
			}
		}

		return {
			success: true,
			data: allocationResults
		};
	} catch (error) {
		console.error('Account allocation error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Allocation failed'
		};
	}
}

/**
 * Deliver allocated accounts to customer via email
 */
async function deliverAccounts(orderId: string) {
	try {
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
			return { success: false, error: 'Order not found' };
		}

		if (order.status !== 'completed') {
			return { success: false, error: 'Order must be completed before delivery' };
		}

		// Check if accounts are allocated
		const totalAllocated = order.orderItems.reduce((sum, item) => sum + item.accounts.length, 0);
		if (totalAllocated === 0) {
			return { success: false, error: 'No accounts allocated for this order' };
		}

		// Generate email content
		const emailContent = generateAccountDeliveryEmail(order);
		const customerEmail = order.guestEmail;

		if (!customerEmail) {
			return { success: false, error: 'No customer email found' };
		}

		// Send email via our email service
		const emailResult = await sendEmail({
			to: customerEmail,
			subject: `Order ${order.orderNumber} Delivered - View Your Accounts`,
			content: emailContent
		});

		if (!emailResult.success) {
			return { success: false, error: 'Failed to send email: ' + emailResult.error };
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

		return {
			success: true,
			data: {
				accountsDelivered: totalAllocated,
				messageId: emailResult.messageId,
				customerEmail
			}
		};
	} catch (error) {
		console.error('Account delivery error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Delivery failed'
		};
	}
}

/**
 * Send email using our email service
 */
async function sendEmail({
	to,
	subject,
	content
}: {
	to: string;
	subject: string;
	content: string;
}) {
	try {
		// Import nodemailer and env here to avoid issues

		const gmailUser = env.GMAIL_USER;
		const gmailPassword = env.GMAIL_APP_PASSWORD;

		if (!gmailUser || !gmailPassword) {
			return { success: false, error: 'Email service not configured' };
		}

		// Create transporter
		const transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: gmailUser,
				pass: gmailPassword
			}
		});

		// Email options
		const mailOptions = {
			from: `"FastAccs" <${gmailUser}>`,
			to: to,
			subject: subject,
			text: content,
			html: formatEmailContent(content)
		};

		console.log('Sending email via Gmail:', { to, subject });

		// Send email
		const result = await transporter.sendMail(mailOptions);

		console.log('Email sent successfully:', result.messageId);

		return {
			success: true,
			messageId: result.messageId
		};
	} catch (error) {
		console.error('Error sending email:', error);
		return { success: false, error: error instanceof Error ? error.message : 'Email send failed' };
	}
}

/**
 * Generate notification email content (without credentials - dashboard only)
 */
function generateAccountDeliveryEmail(order: OrderWithItems): string {
	const orderItems = order.orderItems;
	const totalAccounts = orderItems.reduce((sum, item) => sum + item.accounts.length, 0);

	let content = `**Dear Customer,**

Great news! Your order is ready and has been delivered to your dashboard.

**Order Details:**
- Order Number: ${order.orderNumber}
- Order Date: ${new Date(order.createdAt).toLocaleDateString()}
- Total Amount: ₦${order.totalAmount}
- Accounts Delivered: ${totalAccounts}

**Purchased Items:**

`;

	orderItems.forEach((item: OrderItemWithAccounts) => {
		if (item.accounts.length > 0) {
			content += `- ${item.productName}: ${item.accounts.length} account${item.accounts.length > 1 ? 's' : ''}\n`;
		}
	});

	content += `

**Access Your Accounts:**

To view your account credentials and details, please visit your dashboard:

👉 **View Purchases:** ${PUBLIC_BASE_URL || 'http://localhost:5173'}/dashboard

Go to the "Purchases" tab to see all your account details including usernames, passwords, and login links.

**Important Security Notes:**
- Your credentials are securely stored and only visible in your dashboard
- Please change passwords immediately after accessing accounts
- Never share your account credentials with anyone
- Contact support immediately if you notice any issues

**Need Help?**
If you have any questions or need assistance accessing your accounts, our support team is here to help.

Thank you for choosing FastAccs!

**The FastAccs Team**`;

	return content;
}

/**
 * Format email content as HTML
 */
function formatEmailContent(content: string): string {
	return content
		.replace(/\n/g, '<br>')
		.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
		.replace(/^- (.*$)/gim, '<li>$1</li>')
		.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
}
