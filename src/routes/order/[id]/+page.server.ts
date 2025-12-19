import { prisma } from '$lib/prisma';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const orderId = params.id;

	if (!orderId) {
		throw error(404, 'Order not found');
	}

	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			orderItems: {
				include: {
					accounts: true,
					category: true
				}
			},
			user: true
		}
	});

	if (!order) {
		throw error(404, 'Order not found');
	}

	// Convert Decimal fields to numbers for serialization
	return {
		order: {
			...order,
			subtotal: Number(order.subtotal),
			taxAmount: Number(order.taxAmount),
			discountAmount: Number(order.discountAmount),
			totalAmount: Number(order.totalAmount),
			orderItems: order.orderItems.map((item) => ({
				...item,
				unitPrice: Number(item.unitPrice),
				totalPrice: Number(item.totalPrice),
				// Use actual account count if allocatedCount is 0
				allocatedCount: item.allocatedCount || item.accounts.length
			}))
		}
	};
};
