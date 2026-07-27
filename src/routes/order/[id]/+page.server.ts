import { prisma } from '$lib/prisma';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import { sanitizeBuyerOrderAccounts } from '$lib/helpers/buyer-order-visibility';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { ORDER_CUSTOMER_USER_SELECT } from '$lib/auth/browser-session';
import { toSerializableDecimals } from '$lib/helpers/serialize';

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
					category: true,
					phoneRental: true
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

	// Phone (Numbers) orders: expose the rented number + OTP state for the live view.
	const phoneItem = order.orderType === 'phone'
		? order.orderItems.find((item) => item.phoneRental)
		: null;
	const phone = phoneItem?.phoneRental
		? {
				orderItemId: phoneItem.id,
				serviceName: phoneItem.phoneRental.serviceName,
				countryName: phoneItem.phoneRental.countryName,
				phoneNumber: phoneItem.phoneRental.phoneNumber,
				status: phoneItem.phoneRental.status,
				otp: phoneItem.phoneRental.otp,
				smsMessage: phoneItem.phoneRental.smsMessage,
				expiresAt: phoneItem.phoneRental.expiresAt?.toISOString() ?? null
			}
		: null;

	// Convert Decimal fields to numbers for serialization
	return {
		fromTab,
		phone,
		support: {
			whatsappNumber: settings?.business.whatsappNumber || '',
			loginGuideFallbackUrl: 'https://smm.fastaccs.com/support#after-purchase-guide'
		},
		order: toSerializableDecimals({
			...buyerOrder,
			subtotal: Number(buyerOrder.subtotal),
			taxAmount: Number(buyerOrder.taxAmount),
			discountAmount: Number(buyerOrder.discountAmount),
			storeCreditApplied: Number(buyerOrder.storeCreditApplied),
			totalAmount: Number(buyerOrder.totalAmount),
			orderItems: buyerOrder.orderItems.map((item) => ({
				...item,
				unitPrice: Number(item.unitPrice),
				totalPrice: Number(item.totalPrice),
				allocatedCount: item.accounts.length
			}))
		})
	};
};
