import { json } from '@sveltejs/kit';
import { prisma } from '$lib/prisma';

// GET /api/orders - Get all orders with optional filters
export async function GET({ url }) {
	try {
		const status = url.searchParams.get('status');
		const customerEmail = url.searchParams.get('customerEmail');
		const limit = url.searchParams.get('limit');

		const where: Record<string, string> = {};
		if (status) where.status = status;
		if (customerEmail) where.customerEmail = customerEmail;

		const data = await prisma.order.findMany({
			where,
			include: {
				orderItems: {
					include: {
						accounts: true
					}
				},
				user: true
			},
			orderBy: { createdAt: 'desc' },
			...(limit && { take: parseInt(limit) })
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

// POST /api/orders - Create new order
export async function POST({ request }) {
	try {
		const orderData = await request.json();

		// Get category information to get proper tier names
		const categoryPromises = orderData.items.map(
			async (item: { categoryId: string; quantity: number; price: number }) => {
				const category = await prisma.category.findUnique({
					where: { id: item.categoryId },
					include: {
						parent: true // Include parent category (which should be the platform)
					}
				});
				return {
					...item,
					categoryName: category
						? `${category.parent?.name || 'Unknown Platform'} ${category.name}`
						: `Tier-${item.categoryId}`
				};
			}
		);

		const itemsWithNames = await Promise.all(categoryPromises);

		// ✅ FIXED: Create order with proper structure for account allocation
		const data = await prisma.order.create({
			data: {
				userId: orderData.userId,
				orderNumber: `ORD-${Date.now()}`,
				guestEmail: orderData.email,
				guestPhone: orderData.phone,
				subtotal: orderData.totalAmount,
				totalAmount: orderData.totalAmount,
				currency: orderData.currency || 'NGN',
				paymentMethod: orderData.paymentMethod,
				deliveryMethod: 'email', // Default delivery method
				deliveryContact: orderData.email,
				status: 'pending',
				orderItems: {
					create: itemsWithNames.map((item) => ({
						categoryId: item.categoryId, // ✅ FIXED: Use categoryId field that matches the schema
						quantity: item.quantity,
						unitPrice: item.price,
						totalPrice: item.price * item.quantity,
						productName: item.categoryName, // ✅ FIXED: Use actual tier name
						productCategory: 'tier'
					}))
				}
			},
			include: {
				orderItems: {
					include: {
						accounts: true
					}
				}
			}
		}); // ✅ FIXED: Automatically fulfill order (allocate + deliver accounts)
		try {
			const { fulfillOrder } = await import('$lib/services/fulfillment');
			const fulfillmentResult = await fulfillOrder(data.id);

			if (fulfillmentResult.success) {
				return json({
					data,
					success: true,
					orderId: data.id,
					allocation: fulfillmentResult.allocation,
					delivery: fulfillmentResult.delivery,
					message:
						'Order created and fulfilled successfully! Check your email for account details.',
					error: null
				});
			} else {
				return json({
					data,
					success: true,
					orderId: data.id,
					warning: 'Order created but fulfillment failed: ' + fulfillmentResult.error,
					error: null
				});
			}
		} catch (fulfillmentError) {
			console.error('Order fulfillment error:', fulfillmentError);
			return json({
				data,
				success: true,
				orderId: data.id,
				warning: 'Order created but automatic fulfillment failed. Please process manually.',
				error: null
			});
		}
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
