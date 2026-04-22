import { randomUUID } from 'crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { fulfillOrder } from '$lib/services/fulfillment';
import { initializeTransaction } from '$lib/services/monnify';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';

interface CreateOrderItemInput {
	categoryId: string;
	quantity: number;
	price: number;
}

interface CreateOrderInput {
	email?: string;
	phone?: string;
	items?: CreateOrderItemInput[];
	totalAmount?: number;
	currency?: string;
	paymentMethod?: string;
	affiliateCode?: string;
}

function isAdminUser(user: { userType?: string } | null | undefined): boolean {
	return user?.userType === 'ADMIN';
}

function sanitizeLimit(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.min(parsed, 200);
}

const cleanupOrderCreation = async (orderId: string) => {
	await prisma.$transaction([
		prisma.orderItem.deleteMany({
			where: { orderId }
		}),
		prisma.order.delete({
			where: { id: orderId }
		})
	]);
};

// GET /api/orders - Get all orders with optional filters
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		if (!locals.user) {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const status = url.searchParams.get('status');
		const customerEmail = url.searchParams.get('customerEmail');
		const userId = url.searchParams.get('userId');
		const limit = sanitizeLimit(url.searchParams.get('limit'));

		const admin = isAdminUser(locals.user);
		const where: { status?: string; guestEmail?: string; userId?: string } = {};

		if (status) where.status = status;

		if (admin) {
			if (customerEmail) where.guestEmail = customerEmail;
			if (userId) where.userId = userId;
		} else {
			where.userId = locals.user.id;
		}

		const data = await prisma.order.findMany({
			where,
			include: admin
				? {
						orderItems: {
							include: {
								accounts: true
							}
						},
						user: true
					}
				: {
						orderItems: true
					},
			orderBy: { createdAt: 'desc' },
			...(limit ? { take: limit } : {})
		});

		return json({ data, error: null });
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

// POST /api/orders - Create new order
export const POST: RequestHandler = async ({ request, locals, url }) => {
	try {
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		if (!locals.user.emailVerified) {
			return json(
				{
					success: false,
					error: 'Email verification required before checkout.',
					code: 'EMAIL_NOT_VERIFIED'
				},
				{ status: 403 }
			);
		}

		const orderData = (await request.json()) as CreateOrderInput;
		const items = Array.isArray(orderData.items) ? orderData.items : [];

		if (items.length === 0) {
			return json({ success: false, error: 'Order items are required' }, { status: 400 });
		}

		const normalizedItems = items.map((item) => ({
			categoryId: String(item.categoryId || '').trim(),
			quantity: Number(item.quantity),
			price: Number(item.price)
		}));

		const invalidItem = normalizedItems.find(
			(item) =>
				!item.categoryId ||
				!Number.isFinite(item.quantity) ||
				item.quantity <= 0 ||
				!Number.isFinite(item.price) ||
				item.price < 0
		);

		if (invalidItem) {
			return json({ success: false, error: 'Invalid order item payload' }, { status: 400 });
		}

		const totalAmount = Number(orderData.totalAmount);
		if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
			return json({ success: false, error: 'Invalid total amount' }, { status: 400 });
		}

		const paymentMethod = String(orderData.paymentMethod || '').trim().toLowerCase() || 'monnify';
		const customerEmail = String(orderData.email || locals.user.email || '').trim();
		const customerPhone = String(orderData.phone || locals.user.phone || '').trim();

		if (!customerEmail) {
			return json({ success: false, error: 'Customer email is required' }, { status: 400 });
		}

		// Get category information to get proper tier names
		const categoryPromises = normalizedItems.map(async (item) => {
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
		});

		const itemsWithNames = await Promise.all(categoryPromises);

		// Validate affiliate code if provided
		let affiliateUserId: string | undefined;
		if (orderData.affiliateCode) {
			const affiliateProgram = await prisma.affiliateProgram.findUnique({
				where: {
					affiliateCode: orderData.affiliateCode.toUpperCase(),
					status: 'active'
				},
				select: { userId: true }
			});
			if (affiliateProgram) {
				affiliateUserId = affiliateProgram.userId;
			}
		}

		// Create order with proper structure for account allocation
		const data = await prisma.order.create({
			data: {
				userId: locals.user.id,
				orderNumber: `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
				guestEmail: customerEmail,
				guestPhone: customerPhone || null,
				subtotal: totalAmount,
				totalAmount: totalAmount,
				currency: orderData.currency || 'NGN',
				paymentMethod: paymentMethod,
				deliveryMethod: 'email', // Default delivery method
				deliveryContact: customerEmail,
				status: 'pending',
				affiliateCode: orderData.affiliateCode?.toUpperCase(),
				affiliateUserId,
				orderItems: {
					create: itemsWithNames.map((item) => ({
						categoryId: item.categoryId,
						quantity: item.quantity,
						unitPrice: item.price,
						totalPrice: item.price * item.quantity,
						productName: item.categoryName,
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
		}); // Automatically fulfill order (allocate + deliver accounts)

		// Invalidate admin stats cache after order creation
		invalidateAdminStatsCache();

		if (paymentMethod === 'monnify') {
			const shortOrderId = data.id.substring(0, 8);
			const paymentReference = `ORD_${shortOrderId}_${Date.now()}`;
			const redirectUrl = `${url.origin}/checkout/verify?orderId=${encodeURIComponent(data.id)}`;

			const initResult = await initializeTransaction({
				amount: Number(data.totalAmount),
				customerName: locals.user.fullName || customerEmail || 'Customer',
				customerEmail,
				paymentReference,
				paymentDescription: `Payment for order ${shortOrderId}`,
				redirectUrl,
				metaData: { orderId: data.id, userId: locals.user.id }
			});

			if (!initResult.success || !initResult.checkoutUrl) {
				try {
					await cleanupOrderCreation(data.id);
					invalidateAdminStatsCache();
				} catch (cleanupError) {
					console.error('Failed to cleanup order after Monnify init failure:', cleanupError);
					try {
						await prisma.order.update({
							where: { id: data.id },
							data: {
								status: 'failed',
								paymentStatus: 'failed'
							}
						});
						invalidateAdminStatsCache();
					} catch (markFailedError) {
						console.error('Failed to mark order failed after Monnify init failure:', markFailedError);
					}
				}

				return json(
					{
						success: false,
						error: initResult.error || 'Failed to initialize payment'
					},
					{ status: 502 }
				);
			}

			await prisma.order.update({
				where: { id: data.id },
				data: {
					paymentReference,
					status: 'pending_payment',
					paymentStatus: 'pending'
				}
			});
			invalidateAdminStatsCache();

			return json({
				data,
				success: true,
				orderId: data.id,
				checkoutUrl: initResult.checkoutUrl,
				paymentReference,
				error: null
			});
		}

		try {
			const fulfillmentResult = await fulfillOrder(data.id);

			if (fulfillmentResult.success) {
				return json({
					data,
					success: true,
					orderId: data.id,
					allocation: fulfillmentResult.allocation,
					delivery: fulfillmentResult.delivery,
					message: 'Order created and fulfilled successfully! Check your email for account details.',
					error: null
				});
			}

			return json({
				data,
				success: true,
				orderId: data.id,
				warning: 'Order created but fulfillment failed: ' + fulfillmentResult.error,
				error: null
			});
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
};
