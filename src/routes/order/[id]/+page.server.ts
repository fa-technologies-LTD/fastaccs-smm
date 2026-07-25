import { prisma } from '$lib/prisma';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAdminSettingsSnapshot } from '$lib/services/admin-settings';
import { sanitizeBuyerOrderAccounts } from '$lib/helpers/buyer-order-visibility';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { ORDER_CUSTOMER_USER_SELECT } from '$lib/auth/browser-session';
import { Prisma } from '@prisma/client';

// Prisma Decimal objects can't cross the SvelteKit load boundary (they're non-POJOs and
// throw "Cannot stringify arbitrary non-POJOs"). Deep-convert every Decimal to a number so
// no field — storeCreditApplied, engagementRate, or any future one — can 500 this page.
// Uses Prisma.Decimal.isDecimal (minification-proof) rather than constructor.name.
function toSerializableDecimals<T>(value: T): T {
	if (value === null || value === undefined || value instanceof Date) return value;
	if (Prisma.Decimal.isDecimal(value)) {
		return (value as unknown as Prisma.Decimal).toNumber() as unknown as T;
	}
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return value.map((item) => toSerializableDecimals(item)) as unknown as T;
		}
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>)) {
			out[key] = toSerializableDecimals((value as Record<string, unknown>)[key]);
		}
		return out as T;
	}
	return value;
}

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
