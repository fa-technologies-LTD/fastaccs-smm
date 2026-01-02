import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// POST /api/orders/[id]/process - Process order (allocate accounts)
export async function POST({ params }) {
	try {
		// ✅ FIXED: Implement actual account allocation logic - the critical missing piece
		const orderId = params.id;

		// Get order with items and categories
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				orderItems: true
			}
		});

		if (!order) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		if (order.status === 'completed') {
			return json({ error: 'Order already processed' }, { status: 400 });
		}

		// Process each order item and allocate accounts
		const allocationResults = [];

		for (const item of order.orderItems) {
			// ✅ FIXED: Use the field that exists in current database schema (suppressing TS for DB mismatch)
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

				return json(
					{
						error: `Insufficient accounts available for ${item.productName}. Requested: ${item.quantity}, Available: ${availableAccounts.length}`
					},
					{ status: 400 }
				);
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
		const updatedOrder = await prisma.order.update({
			where: { id: orderId },
			data: {
				status: 'completed',
				updatedAt: new Date()
			},
			include: {
				orderItems: {
					include: {
						accounts: true
					}
				},
				user: true
			}
		});

		return json({
			data: updatedOrder,
			allocation: allocationResults,
			message: 'Accounts allocated successfully. Use /deliver endpoint to send to customer.',
			error: null
		});
	} catch (error) {
		console.error('Database error during order processing:', error);

		// Rollback any allocated accounts for this order on error
		try {
			const orderId = params.id;
			await prisma.account.updateMany({
				where: {
					orderItem: { orderId: orderId },
					status: 'allocated'
				},
				data: {
					status: 'available',
					orderItemId: null
				}
			});
			
		} catch (rollbackError) {
			console.error('Failed to rollback allocated accounts:', rollbackError);
		}

		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
