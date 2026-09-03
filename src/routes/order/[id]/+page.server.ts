import { prisma } from '$lib/prisma';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBusinessSettingsSnapshot } from '$lib/services/admin-settings';
import { sanitizeBuyerOrderAccounts } from '$lib/helpers/buyer-order-visibility';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { ORDER_CUSTOMER_USER_SELECT } from '$lib/auth/browser-session';
import { toSerializableDecimals } from '$lib/helpers/serialize';
import { getPhonePricingConfig } from '$lib/services/phone-pricing';

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
	const [business, phonePricing] = await Promise.all([
		getBusinessSettingsSnapshot().catch(() => null),
		order.orderType === 'phone' ? getPhonePricingConfig().catch(() => null) : Promise.resolve(null)
	]);
	const buyerOrder = sanitizeBuyerOrderAccounts(order);
	const boostingIssueEvents = order.orderItems.some((item) => Boolean(item.boostTargetUrl))
		? await prisma.orderEvent.findMany({
				where: {
					orderId: order.id,
					orderItemId: { not: null },
					type: { in: ['boosting_link_review_requested', 'boosting_rejected'] }
				},
				select: { orderItemId: true, description: true, occurredAt: true },
				orderBy: { occurredAt: 'desc' }
			})
		: [];
	const latestBoostingIssueByItem = new Map<string, string | null>();
	for (const event of boostingIssueEvents) {
		if (!event.orderItemId || latestBoostingIssueByItem.has(event.orderItemId)) continue;
		latestBoostingIssueByItem.set(event.orderItemId, event.description);
	}

	// Phone (Numbers) orders: expose the rented number + OTP state for the live view.
	const phoneItem =
		order.orderType === 'phone' ? order.orderItems.find((item) => item.phoneRental) : null;
	const phoneRefundMessage = (() => {
		const r = phoneItem?.phoneRental;
		if (!r) return null;
		if (!['refunded', 'failed', 'expired', 'cancelled'].includes(r.status)) return null;
		const reason = (r.failureReason || '').toLowerCase();
		if (reason.includes('cancelled by you')) return 'Cancelled — refunded to your store credit.';
		if (
			reason.includes('available number') ||
			reason.includes('could not') ||
			reason.includes('rent') ||
			reason.includes('persist') ||
			!r.hubOrderUuid // never got a number at all
		)
			return "We couldn't get you a number right now — you've been refunded to store credit. Please try again in a few minutes.";
		return "No code arrived in time — you've been refunded to your store credit.";
	})();

	const phone = phoneItem?.phoneRental
		? {
				orderItemId: phoneItem.id,
				// The tier (Category) id, so "Try another number" can re-buy this exact service+country
				// straight to checkout instead of sending the customer back to re-pick. Read-only.
				tierId: phoneItem.categoryId ?? null,
				serviceName: phoneItem.phoneRental.serviceName,
				countryName: phoneItem.phoneRental.countryName,
				phoneNumber: phoneItem.phoneRental.phoneNumber,
				status: phoneItem.phoneRental.status,
				otp: phoneItem.phoneRental.otp,
				smsMessage: phoneItem.phoneRental.smsMessage,
				expiresAt: phoneItem.phoneRental.expiresAt?.toISOString() ?? null,
				rentedAt: phoneItem.phoneRental.rentedAt?.toISOString() ?? null,
				replacementWaitSeconds: Math.max(
					30,
					Math.round(phonePricing?.otpReplacementWaitSeconds ?? 120)
				),
				// D1: the authoritative "I've requested the code" time so a refresh/return from WhatsApp
				// reconstructs the waiting state instead of re-prompting. D2: the sale amount (Numbers
				// always refund the full sale) to show the exact ₦ refunded. Both read-only.
				otpRequestedAt: phoneItem.phoneRental.otpRequestedAt?.toISOString() ?? null,
				saleAmountNgn:
					phoneItem.phoneRental.saleAmountNgn != null
						? Number(phoneItem.phoneRental.saleAmountNgn)
						: null,
				refundMessage: phoneRefundMessage
			}
		: null;

	// Convert Decimal fields to numbers for serialization
	return {
		fromTab,
		phone,
		support: {
			whatsappNumber: business?.whatsappNumber || '',
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
				allocatedCount: item.accounts.length,
				boostIssueReason: latestBoostingIssueByItem.get(item.id) || null
			}))
		})
	};
};
