import { prisma } from '$lib/prisma';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/login?returnUrl=${encodeURIComponent(url.pathname + url.search)}`);
	}

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

	const isOwner = order.userId === locals.user.id;
	const isAdmin = locals.user.userType === 'ADMIN';
	if (!isOwner && !isAdmin) {
		throw error(403, 'Unauthorized access to order');
	}

	const fromTabParam = String(url.searchParams.get('fromTab') || '').toLowerCase();
	const fromTab = ['orders', 'purchases', 'affiliate'].includes(fromTabParam)
		? fromTabParam
		: 'orders';

	// Convert Decimal fields to numbers for serialization
	return {
		fromTab,
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
