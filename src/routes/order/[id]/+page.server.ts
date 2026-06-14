import { prisma } from '$lib/prisma';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import { sanitizeBuyerOrderAccounts } from '$lib/helpers/buyer-order-visibility';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { ORDER_CUSTOMER_USER_SELECT } from '$lib/auth/browser-session';

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
			user: {
				select: ORDER_CUSTOMER_USER_SELECT
			}
		}
	});

	if (!order) {
		throw error(404, 'Order not found');
	}

	const isOwner = order.userId === locals.user.id;
	const isAdmin = hasAdminPermission(locals.adminContext, 'admin:access');
	if (!isOwner && !isAdmin) {
		throw error(403, 'Unauthorized access to order');
	}

	const fromTabParam = String(url.searchParams.get('fromTab') || '').toLowerCase();
	const fromTab = ['orders', 'purchases', 'affiliate'].includes(fromTabParam)
		? fromTabParam
		: 'orders';
	const settings = await getAdminSettingsSnapshot().catch(() => null);
	const buyerOrder = sanitizeBuyerOrderAccounts(order);

	// Convert Decimal fields to numbers for serialization
	return {
		fromTab,
		support: {
			whatsappNumber: settings?.business.whatsappNumber || '',
			loginGuideFallbackUrl: 'https://smm.fastaccs.com/support#after-purchase-guide'
		},
		order: {
			...buyerOrder,
			subtotal: Number(buyerOrder.subtotal),
			taxAmount: Number(buyerOrder.taxAmount),
			discountAmount: Number(buyerOrder.discountAmount),
			totalAmount: Number(buyerOrder.totalAmount),
			orderItems: buyerOrder.orderItems.map((item) => ({
				...item,
				unitPrice: Number(item.unitPrice),
				totalPrice: Number(item.totalPrice),
				allocatedCount: item.accounts.length
			}))
		}
	};
};
