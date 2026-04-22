import { prisma } from '$lib/prisma';
import { recordCommission } from './affiliate';
import { sendOrderConfirmationEmailIfNeeded } from './email';
import { invalidateAdminStatsCache } from './admin-metrics';
import { sendLowStockAdminAlertIfNeeded } from './admin-alerts';

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

		invalidateAdminStatsCache();
		void sendLowStockAdminAlertIfNeeded('order_allocation').catch((error) => {
			console.error('Failed to evaluate low-stock alert after allocation:', error);
		});

		try {
			await sendOrderConfirmationEmailIfNeeded(orderId);
		} catch (emailError) {
			console.error('Failed to send order confirmation email:', emailError);
		}

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
				},
				user: {
					select: { email: true }
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

		const customerEmail = order.guestEmail || order.user?.email || '';

		if (!customerEmail) {
			return { success: false, error: 'No customer email found' };
		}

		try {
			await sendOrderConfirmationEmailIfNeeded(order.id);
		} catch (emailError) {
			console.error('Failed to send order confirmation email after delivery:', emailError);
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

		invalidateAdminStatsCache();

		return {
			success: true,
			data: {
				accountsDelivered: totalAllocated,
				messageId: undefined,
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
