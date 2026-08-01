import { randomUUID } from 'crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { runWithDbRetry } from '$lib/server/db-retry';
import { fulfillOrder } from '$lib/services/fulfillment';
import * as hubman from '$lib/services/hubman';
import { getPhoneTierConfig } from '$lib/helpers/phone-tier-config';
import { initializeTransaction } from '$lib/services/monnify';
import { invalidateAdminStatsCache } from '$lib/services/admin-metrics';
import { validatePromotionCode } from '$lib/services/promotions';
import {
	getAffiliateDiscountForOrder,
	maybeSendAffiliateUnlockInvite,
	recordAffiliateStoreCreditForOrder,
	resolveOrderAffiliateAttribution,
	validateAffiliateCode
} from '$lib/services/affiliate';
import {
	getMinimumOrderValueSetting,
	isCheckoutEnabledSetting
} from '$lib/services/admin-settings';
import {
	canViewOrderAmounts,
	redactOrderFinancials
} from '$lib/services/admin-revenue-visibility';
import {
	normalizeTierDeliveryMode,
	getTierStockStatus,
	type TierDeliveryMode
} from '$lib/helpers/tier-delivery-config';
import {
	getBoostingServiceConfig,
	isValidBoostingQuantity,
	computeBoostingPrice
} from '$lib/helpers/boosting-service-config';
import { validateLinkForAction } from '$lib/helpers/social-link-validator';
import {
	attachExactPreviewSelectionsToOrder,
	releaseExpiredExactPreviewReservations
} from '$lib/services/exact-preview';
import {
	releaseExpiredOrderReservations,
	releaseOrderReservations,
	reserveStandardAccountsForOrder
} from '$lib/services/order-reservations';
import {
	getStoreCreditBuckets,
	computeOrderRedemption,
	redeemStoreCreditForOrder,
	reverseStoreCreditRedemption
} from '$lib/services/store-credit';
import { recoverPaidOrder } from '$lib/services/payment-settlement';
import { logOrderStatusTransition } from '$lib/services/order-audit';
import {
	getPaymentReservationExpiresAt,
	getPendingPaymentExpiresAt
} from '$lib/helpers/payment-expiry.server';
import {
	CHECKOUT_DISABLED_CODE,
	CHECKOUT_DISABLED_MESSAGE,
	isNewCheckoutInitializationDisabled
} from '$lib/helpers/checkout-control.server';
import { createPaymentTraceId, logPaymentEvent } from '$lib/server/payment-observability';
import {
	getMonnifyInitializationErrorMessage,
	getMonnifyInitializationIssue,
	MONNIFY_CURRENCY
} from '$lib/helpers/monnify-initialization.server';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { ORDER_CUSTOMER_USER_SELECT } from '$lib/auth/browser-session';

interface CreateOrderItemInput {
	categoryId: string;
	quantity: number;
	price?: number;
	exactAccountId?: string;
	exactAccountLabel?: string;
	boostTargetUrl?: string;
	boostQuantity?: number;
}

interface CreateOrderInput {
	email?: string;
	phone?: string;
	items?: CreateOrderItemInput[];
	totalAmount?: number;
	currency?: string;
	paymentMethod?: string;
	checkoutKey?: string;
	affiliateCode?: string;
	promotionCode?: string;
	useStoreCredit?: boolean;
	analytics?: {
		ga4ClientId?: string | null;
	};
}

const CHECKOUT_INITIALIZATION_GRACE_MS = 2 * 60 * 1000;

function normalizeGa4ClientId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return /^\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

function normalizeCheckoutKey(value: unknown): string {
	if (typeof value !== 'string') return randomUUID();
	const trimmed = value.trim();
	if (!/^[a-zA-Z0-9_-]{16,100}$/.test(trimmed)) return randomUUID();
	return trimmed;
}

function isActiveCheckoutOrder(order: {
	status: string;
	paymentStatus: string;
	paymentCheckoutUrl: string | null;
	paymentExpiresAt: Date | null;
}): boolean {
	return (
		['pending', 'pending_payment'].includes(order.status) &&
		order.paymentStatus !== 'paid' &&
		Boolean(order.paymentCheckoutUrl) &&
		Boolean(order.paymentExpiresAt && order.paymentExpiresAt.getTime() > Date.now())
	);
}

function buildOrderAnalyticsMetadata(
	analytics: CreateOrderInput['analytics']
): Prisma.InputJsonObject {
	const metadata: Record<string, string> = {};
	const ga4ClientId = normalizeGa4ClientId(analytics?.ga4ClientId);

	if (ga4ClientId) {
		metadata.ga4ClientId = ga4ClientId;
		metadata.capturedAt = new Date().toISOString();
		metadata.source = 'checkout';
	}

	return metadata as Prisma.InputJsonObject;
}

function sanitizeLimit(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.min(parsed, 200);
}

type TierMetadataShape = {
	pricing?: {
		base_price?: unknown;
	};
	price?: unknown;
};

function extractTierUnitPrice(metadata: unknown): number {
	const typedMetadata =
		metadata && typeof metadata === 'object' ? (metadata as TierMetadataShape) : undefined;
	const rawPrice = typedMetadata?.pricing?.base_price ?? typedMetadata?.price;
	const parsedPrice = Number(rawPrice);
	return Number.isFinite(parsedPrice) ? parsedPrice : 0;
}

// GET /api/orders - Get all orders with optional filters
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		if (!locals.user) {
			return json({ data: null, error: 'Unauthorized' }, { status: 401 });
		}

		const status = url.searchParams.get('status');
		const customerEmail = url.searchParams.get('customerEmail');
		const userId = url.searchParams.get('userId');
		const orderType = url.searchParams.get('type');
		const limit = sanitizeLimit(url.searchParams.get('limit'));

		const admin = hasAdminPermission(locals.adminContext, 'admin:access');
		const where: { status?: string; guestEmail?: string; userId?: string; orderType?: string } =
			{};

		if (status) where.status = status;
		if (orderType === 'account' || orderType === 'boosting') where.orderType = orderType;

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
						user: {
							select: ORDER_CUSTOMER_USER_SELECT
						}
					}
				: {
						orderItems: true
					},
			orderBy: { createdAt: 'desc' },
			...(limit ? { take: limit } : {})
		});
		const responseData =
			admin && !canViewOrderAmounts(locals)
				? data.map((order) => redactOrderFinancials(order))
				: data;

		return json({ data: responseData, error: null });
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
	const traceId = createPaymentTraceId(request);

	try {
		if (!locals.user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const checkoutEnabled = await isCheckoutEnabledSetting().catch(() => true);
		if (!checkoutEnabled && locals.user.userType !== 'ADMIN') {
			return json({ success: false, error: 'Checkout is temporarily disabled.' }, { status: 503 });
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

		const checkoutUserId = locals.user.id;
		const orderData = (await request.json()) as CreateOrderInput;
		const checkoutKey = normalizeCheckoutKey(orderData.checkoutKey);
		const items = Array.isArray(orderData.items) ? orderData.items : [];

		if (items.length === 0) {
			return json({ success: false, error: 'Order items are required' }, { status: 400 });
		}

		const existingCheckout = await prisma.order.findUnique({
			where: { checkoutKey }
		});
		if (existingCheckout) {
			if (existingCheckout.userId !== checkoutUserId) {
				return json({ success: false, error: 'Checkout session conflict.' }, { status: 409 });
			}

			if (isActiveCheckoutOrder(existingCheckout)) {
				logPaymentEvent('info', 'checkout.resumed', {
					traceId,
					orderId: existingCheckout.id,
					userId: checkoutUserId,
					paymentReference: existingCheckout.paymentReference,
					resumed: true,
					amount: Number(existingCheckout.totalAmount),
					currency: existingCheckout.currency
				});
				return json({
					data: existingCheckout,
					success: true,
					resumed: true,
					orderId: existingCheckout.id,
					checkoutUrl: existingCheckout.paymentCheckoutUrl,
					paymentReference: existingCheckout.paymentReference,
					deliveryMode:
						existingCheckout.deliveryMethod === 'whatsapp' ? 'manual_handover' : 'instant_auto',
					traceId,
					error: null
				});
			}

			if (
				['pending', 'pending_payment'].includes(existingCheckout.status) &&
				existingCheckout.paymentExpiresAt &&
				existingCheckout.paymentExpiresAt.getTime() > Date.now() &&
				existingCheckout.updatedAt.getTime() > Date.now() - CHECKOUT_INITIALIZATION_GRACE_MS
			) {
				return json(
					{
						success: false,
						orderId: existingCheckout.id,
						error: 'Checkout is still initializing. Please try again in a moment.'
					},
					{ status: 409 }
				);
			}

			if (
				['paid', 'completed'].includes(existingCheckout.status) ||
				existingCheckout.paymentStatus === 'paid'
			) {
				return json(
					{
						success: false,
						orderId: existingCheckout.id,
						error: 'This checkout has already been paid.'
					},
					{ status: 409 }
				);
			}

			if (isNewCheckoutInitializationDisabled()) {
				logPaymentEvent('warn', 'checkout.blocked', {
					traceId,
					orderId: existingCheckout.id,
					userId: checkoutUserId,
					source: 'emergency_switch',
					amount: Number(existingCheckout.totalAmount),
					currency: existingCheckout.currency
				});
				return json(
					{
						success: false,
						error: CHECKOUT_DISABLED_MESSAGE,
						code: CHECKOUT_DISABLED_CODE,
						traceId
					},
					{ status: 503 }
				);
			}

			const supersedes = ['pending', 'pending_payment'].includes(existingCheckout.status);
			if (supersedes) {
				// Instrumentation: a fresh checkout attempt for the same cart cancels the
				// prior pending order. Tag + log it so we can measure how much of the
				// "cancelled" volume is retry churn vs real abandonment/expiry.
				logPaymentEvent('info', 'checkout.superseded', {
					traceId,
					orderId: existingCheckout.id,
					userId: checkoutUserId,
					status: existingCheckout.status,
					source: 'checkout_retry'
				});
			}
			await releaseOrderReservations(existingCheckout.id);
			await prisma.order.update({
				where: { id: existingCheckout.id },
				data: {
					checkoutKey: null,
					...(supersedes
						? {
								status: 'cancelled',
								paymentStatus: 'cancelled',
								cancellationReason: 'superseded_retry'
							}
						: {})
				}
			});
		}

		if (isNewCheckoutInitializationDisabled()) {
			logPaymentEvent('warn', 'checkout.blocked', {
				traceId,
				userId: checkoutUserId,
				source: 'emergency_switch'
			});
			return json(
				{
					success: false,
					error: CHECKOUT_DISABLED_MESSAGE,
					code: CHECKOUT_DISABLED_CODE,
					traceId
				},
				{ status: 503 }
			);
		}

		const normalizedItems = items.map((item) => ({
			categoryId: String(item.categoryId || '').trim(),
			quantity: Number(item.quantity),
			exactAccountId:
				typeof item.exactAccountId === 'string' && item.exactAccountId.trim().length > 0
					? item.exactAccountId.trim()
					: null,
			exactAccountLabel:
				typeof item.exactAccountLabel === 'string' && item.exactAccountLabel.trim().length > 0
					? item.exactAccountLabel.trim().slice(0, 40)
					: null,
			boostTargetUrl:
				typeof item.boostTargetUrl === 'string' && item.boostTargetUrl.trim().length > 0
					? item.boostTargetUrl.trim()
					: null,
			boostQuantity:
				typeof item.boostQuantity === 'number' && Number.isFinite(item.boostQuantity)
					? Math.floor(item.boostQuantity)
					: null
		}));

		const invalidItem = normalizedItems.find(
			(item) => !item.categoryId || !Number.isFinite(item.quantity) || item.quantity <= 0
		);

		if (invalidItem) {
			return json({ success: false, error: 'Invalid order item payload' }, { status: 400 });
		}

		const exactSelectionItems = normalizedItems.filter((item) => item.exactAccountId);
		if (exactSelectionItems.length > 0) {
			const invalidExactSelection = exactSelectionItems.find((item) => item.quantity !== 1);
			if (invalidExactSelection) {
				return json(
					{
						success: false,
						error: 'Each exact account selection must use quantity 1.'
					},
					{ status: 400 }
				);
			}
		}

		const paymentMethod =
			String(orderData.paymentMethod || '')
				.trim()
				.toLowerCase() || 'monnify';
		if (paymentMethod !== 'monnify') {
			return json({ success: false, error: 'Unsupported payment method.' }, { status: 400 });
		}
		const orderCurrency = String(orderData.currency || MONNIFY_CURRENCY)
			.trim()
			.toUpperCase();
		if (orderCurrency !== MONNIFY_CURRENCY) {
			logPaymentEvent('warn', 'checkout.initialize.rejected', {
				traceId,
				userId: checkoutUserId,
				currency: orderCurrency,
				errorCode: 'unsupported_currency'
			});
			return json(
				{
					success: false,
					error: getMonnifyInitializationErrorMessage('unsupported_currency'),
					traceId
				},
				{ status: 400 }
			);
		}
		const customerEmail = String(orderData.email || locals.user.email || '').trim();
		const customerPhone = String(orderData.phone || locals.user.phone || '').trim();
		const minimumOrderValue = await getMinimumOrderValueSetting().catch(() => 0);

		if (!customerEmail) {
			return json({ success: false, error: 'Customer email is required' }, { status: 400 });
		}

		// Server-authoritative pricing: never trust client-supplied prices.
		const uniqueCategoryIds = [...new Set(normalizedItems.map((item) => item.categoryId))];
		const categories = await prisma.category.findMany({
			where: {
				id: { in: uniqueCategoryIds },
				categoryType: { in: ['tier', 'boosting_service', 'numbers_tier'] },
				isActive: true
			},
			include: {
				parent: true
			}
		});
		const categoryById = new Map(categories.map((category) => [category.id, category]));

		const itemsWithNames: Array<{
			categoryId: string;
			quantity: number;
			unitPrice: number;
			categoryName: string;
			categoryMetadata: Record<string, unknown>;
			deliveryMode: TierDeliveryMode;
			exactAccountId: string | null;
			exactAccountLabel: string | null;
			boostTargetUrl: string | null;
			boostQuantity: number | null;
		}> = [];
		const deliveryModes = new Set<TierDeliveryMode>();

		for (const item of normalizedItems) {
			const category = categoryById.get(item.categoryId);
			if (!category) {
				return json(
					{ success: false, error: `Tier unavailable: ${item.categoryId}` },
					{ status: 400 }
				);
			}

			if (category.categoryType === 'boosting_service') {
				const config = getBoostingServiceConfig(category.metadata);

				if (!item.boostTargetUrl || !item.boostQuantity) {
					return json(
						{ success: false, error: `${category.name}: a link and quantity are required.` },
						{ status: 400 }
					);
				}

				if (!isValidBoostingQuantity(config, item.boostQuantity)) {
					return json(
						{
							success: false,
							error: `${category.name}: quantity must be at least ${config.minQuantity.toLocaleString()} in steps of ${config.stepQuantity.toLocaleString()}.`
						},
						{ status: 400 }
					);
				}

				const linkCheck = validateLinkForAction(
					config.platform,
					config.actionType,
					item.boostTargetUrl
				);
				if (!linkCheck.valid) {
					return json(
						{ success: false, error: `${category.name}: ${linkCheck.reason || 'invalid link'}` },
						{ status: 400 }
					);
				}

				const unitPrice = computeBoostingPrice(config, item.boostQuantity);
				if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
					return json(
						{ success: false, error: `${category.name} has an invalid price configuration.` },
						{ status: 400 }
					);
				}

				itemsWithNames.push({
					categoryId: item.categoryId,
					quantity: 1,
					unitPrice,
					categoryName: category.name,
					categoryMetadata: (category.metadata as Record<string, unknown> | null | undefined) || {},
					deliveryMode: 'boosting_manual',
					exactAccountId: null,
					exactAccountLabel: null,
					boostTargetUrl: item.boostTargetUrl,
					boostQuantity: item.boostQuantity
				});
				deliveryModes.add('boosting_manual');
				continue;
			}

			const unitPrice = extractTierUnitPrice(category.metadata);
			if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
				return json(
					{ success: false, error: `Tier has invalid price: ${category.id}` },
					{ status: 400 }
				);
			}

			itemsWithNames.push({
				categoryId: item.categoryId,
				quantity: item.quantity,
				unitPrice,
				categoryName: `${category.parent?.name || 'Unknown Platform'} ${category.name}`,
				categoryMetadata: (category.metadata as Record<string, unknown> | null | undefined) || {},
				deliveryMode: normalizeTierDeliveryMode(
					(category.metadata as Record<string, unknown> | null | undefined)?.delivery_mode
				),
				exactAccountId: item.exactAccountId,
				exactAccountLabel: item.exactAccountLabel,
				boostTargetUrl: null,
				boostQuantity: null
			});
			deliveryModes.add(
				normalizeTierDeliveryMode(
					(category.metadata as Record<string, unknown> | null | undefined)?.delivery_mode
				)
			);
		}

		if (deliveryModes.size > 1) {
			return json(
				{
					success: false,
					error:
						'Boosting services, manual handover items, and instant delivery items must be checked out separately.'
				},
				{ status: 400 }
			);
		}

		await releaseExpiredOrderReservations();
		await releaseExpiredExactPreviewReservations();

		const stockCheckCategoryIds = [
			...new Set(
				itemsWithNames
					.filter(
						(item) =>
							!item.exactAccountId &&
							!item.boostTargetUrl &&
							item.deliveryMode !== 'manual_handover' &&
							item.deliveryMode !== 'auto_sms'
					)
					.map((item) => item.categoryId)
			)
		];
		const availabilityByCategory =
			stockCheckCategoryIds.length > 0
				? new Map(
						(
							await prisma.account.groupBy({
								by: ['categoryId'],
								where: {
									categoryId: { in: stockCheckCategoryIds },
									status: 'available'
								},
								_count: { _all: true }
							})
						).map((row) => [row.categoryId, row._count._all])
					)
				: new Map<string, number>();

		for (const item of itemsWithNames) {
			if (item.exactAccountId || item.boostTargetUrl) continue;
			// Manual-handover and auto-SMS (Numbers) tiers have no account inventory —
			// availability is a toggle/flag, not a stock count.
			if (item.deliveryMode === 'manual_handover' || item.deliveryMode === 'auto_sms') {
				if (!getTierStockStatus(item.categoryMetadata, 0).available) {
					return json(
						{ success: false, error: `${item.categoryName} is currently unavailable.` },
						{ status: 409 }
					);
				}
				continue;
			}
			const availableCount = availabilityByCategory.get(item.categoryId) || 0;
			if (availableCount < item.quantity) {
				return json(
					{
						success: false,
						error:
							availableCount > 0
								? `Only ${availableCount} ${item.categoryName} ${availableCount === 1 ? 'account is' : 'accounts are'} available. Please refresh your cart.`
								: `${item.categoryName} is out of stock. Please refresh your cart.`
					},
					{ status: 409 }
				);
			}
		}

		const orderDeliveryMode = Array.from(deliveryModes)[0] ?? 'instant_auto';
		const isManualHandoverOrder = orderDeliveryMode === 'manual_handover';

		const subtotalAmount = itemsWithNames.reduce(
			(sum, item) => sum + item.quantity * item.unitPrice,
			0
		);
		if (!Number.isFinite(subtotalAmount) || subtotalAmount <= 0) {
			return json({ success: false, error: 'Invalid order subtotal' }, { status: 400 });
		}

		const isBoostingCheckout = orderDeliveryMode === 'boosting_manual';
		const isPhoneCheckout = orderDeliveryMode === 'auto_sms';

		// Numbers are fulfilled one activation per order. Enforce a single number at
		// quantity 1 server-side, so a tampered/edited cart can never charge for more
		// numbers than we actually rent (fulfillment rents exactly one).
		if (isPhoneCheckout && (itemsWithNames.length !== 1 || itemsWithNames[0].quantity !== 1)) {
			return json(
				{
					success: false,
					error: 'Numbers are sold one per order — please buy a single number at a time.'
				},
				{ status: 400 }
			);
		}

		// Authoritative buy-time availability guard: the storefront can be a few minutes stale,
		// so before we take a single naira we confirm hub-man can actually supply this number.
		// This stops the "pay → no stock → refund" churn that erodes trust. Fail safe: if the
		// stock can't be confirmed (hub-man down), we don't create the order rather than risk it.
		if (isPhoneCheckout) {
			const phoneCategory = categoryById.get(itemsWithNames[0].categoryId);
			const phoneCfg = phoneCategory ? getPhoneTierConfig(phoneCategory.metadata) : null;
			if (!phoneCfg) {
				return json(
					{
						success: false,
						error: 'This number is currently unavailable — check back later or choose another.',
						code: 'number_unavailable'
					},
					{ status: 409 }
				);
			}
			try {
				const services = await hubman.getAvailableServices(phoneCfg.countryId);
				const available =
					Number(
						services[String(phoneCfg.countryId)]?.[String(phoneCfg.serviceId)]
							?.available_numbers_count
					) || 0;
				if (available <= 0) {
					return json(
						{
							success: false,
							error: 'This number is currently unavailable — check back later or choose another.',
							code: 'number_unavailable'
						},
						{ status: 409 }
					);
				}
			} catch (err) {
				console.error('[orders] phone availability check failed:', (err as Error).message);
				return json(
					{
						success: false,
						error: 'Numbers are momentarily unavailable — please try again in a few seconds.',
						code: 'hubman_unreachable'
					},
					{ status: 503 }
				);
			}
		}
		const requestedPromotionCode = String(orderData.promotionCode || '')
			.trim()
			.toUpperCase();
		const requestedAffiliateCode = String(orderData.affiliateCode || '')
			.trim()
			.toUpperCase();

		// Promo/affiliate pricing applies to ACCOUNTS only. Blocked on boosting and on
		// numbers (a ₦1,000 code on a ₦1,000-floor number would be a guaranteed loss).
		if ((isBoostingCheckout || isPhoneCheckout) && (requestedPromotionCode || requestedAffiliateCode)) {
			return json(
				{
					success: false,
					error: isPhoneCheckout
						? 'Promo and affiliate codes do not apply to Numbers.'
						: 'Promo codes and affiliate pricing do not apply to boosting services.'
				},
				{ status: 400 }
			);
		}

		let attribution: {
			affiliateCode: string | null;
			affiliateUserId: string | null;
			affiliateProgramId: string | null;
			source: 'locked' | 'manual' | 'none';
			error?: string;
		} = {
			affiliateCode: null,
			affiliateUserId: null,
			affiliateProgramId: null,
			source: 'none'
		};
		let promotionId: string | null = null;
		let appliedPromotionCode: string | null = null;
		let discountAmount = 0;
		let finalOrderTotal = Math.round(subtotalAmount * 100) / 100;

		if (!isBoostingCheckout && !isPhoneCheckout) {
			let affiliateCodeInput = requestedAffiliateCode || null;
			if (!affiliateCodeInput && requestedPromotionCode) {
				const affiliateFromPromotionCode = await validateAffiliateCode(requestedPromotionCode);
				if (affiliateFromPromotionCode.valid) {
					affiliateCodeInput = requestedPromotionCode;
				}
			}

			attribution = await resolveOrderAffiliateAttribution({
				buyerUserId: checkoutUserId,
				explicitAffiliateCode: affiliateCodeInput
			});

			if (attribution.error && affiliateCodeInput) {
				return json({ success: false, error: attribution.error }, { status: 400 });
			}

			const hasAffiliateAttribution = Boolean(
				attribution.affiliateCode && attribution.affiliateUserId
			);

			let promotionCode = requestedPromotionCode;
			if (
				hasAffiliateAttribution &&
				promotionCode &&
				promotionCode === String(attribution.affiliateCode || '').toUpperCase()
			) {
				promotionCode = '';
			}

			if (hasAffiliateAttribution && promotionCode) {
				return json(
					{
						success: false,
						error: 'Promo codes cannot be combined with affiliate referral pricing on the same order.'
					},
					{ status: 400 }
				);
			}

			if (promotionCode) {
				const promotionResult = await validatePromotionCode({
					code: promotionCode,
					userId: checkoutUserId,
					subtotal: subtotalAmount,
					categoryIds: itemsWithNames.map((item) => item.categoryId)
				});

				if (!promotionResult.valid || !promotionResult.promotion) {
					return json(
						{ success: false, error: promotionResult.error || 'Promo code is invalid.' },
						{ status: 400 }
					);
				}

				promotionId = promotionResult.promotion.id;
				appliedPromotionCode = promotionResult.promotion.code;
				discountAmount = promotionResult.discountAmount;
				finalOrderTotal = promotionResult.finalTotal;
			} else if (hasAffiliateAttribution && attribution.affiliateUserId) {
				const affiliateDiscount = await getAffiliateDiscountForOrder({
					buyerUserId: checkoutUserId,
					affiliateUserId: attribution.affiliateUserId,
					subtotalAmount,
					orderItems: itemsWithNames.map((item) => ({
						quantity: item.quantity,
						totalPrice: item.unitPrice * item.quantity,
						productName: item.categoryName,
						categoryMetadata: item.categoryMetadata
					}))
				});
				discountAmount = affiliateDiscount.discountAmount;
				finalOrderTotal = Math.max(0, Math.round((subtotalAmount - discountAmount) * 100) / 100);
			}
		}

		// Store-credit redemption (registered users, opt-in). The credit is
		// reserve-debited in the order transaction below; a failed/expired payment
		// reverses it. Refund credit spends freely; earned/gifted capped at 30%.
		let storeCreditRedemption = { refundApplied: 0, earnedApplied: 0, totalApplied: 0 };
		if (orderData.useStoreCredit && checkoutUserId) {
			try {
				storeCreditRedemption = computeOrderRedemption(
					finalOrderTotal,
					await getStoreCreditBuckets(checkoutUserId)
				);
			} catch {
				logPaymentEvent('warn', 'checkout.store_credit.compute_failed', {
					traceId,
					userId: checkoutUserId
				});
			}
		}
		const amountToCharge = Math.max(
			0,
			Math.round((finalOrderTotal - storeCreditRedemption.totalApplied) * 100) / 100
		);
		const isFullyCreditPaid = amountToCharge <= 0 && storeCreditRedemption.totalApplied > 0;

		// A zero/negative charge is only valid when store credit fully covers the
		// order (the zero-charge path). Anything else — e.g. an over-discounted promo
		// with no store credit — is an invalid amount and must be rejected up front.
		if (amountToCharge <= 0 && !isFullyCreditPaid) {
			logPaymentEvent('warn', 'checkout.initialize.rejected', {
				traceId,
				userId: checkoutUserId,
				amount: amountToCharge,
				currency: orderCurrency,
				errorCode: 'invalid_amount'
			});
			return json(
				{
					success: false,
					error: 'Payment amount is invalid. Please refresh your cart and try again.',
					traceId
				},
				{ status: 400 }
			);
		}

		// Only validate the gateway amount when there is a real charge — a fully
		// credit-paid order skips the payment gateway entirely.
		if (amountToCharge > 0) {
			const initializationIssue = getMonnifyInitializationIssue({
				amount: amountToCharge,
				currency: orderCurrency
			});
			if (initializationIssue) {
				logPaymentEvent('warn', 'checkout.initialize.rejected', {
					traceId,
					userId: checkoutUserId,
					amount: amountToCharge,
					currency: orderCurrency,
					errorCode: initializationIssue
				});
				return json(
					{
						success: false,
						error: getMonnifyInitializationErrorMessage(initializationIssue),
						traceId
					},
					{ status: 400 }
				);
			}
		}

		if (finalOrderTotal < minimumOrderValue) {
			return json(
				{
					success: false,
					error: `Order must be at least ₦${Number(minimumOrderValue).toLocaleString()}.`
				},
				{ status: 400 }
			);
		}

		const paymentExpiresAt = getPendingPaymentExpiresAt();
		const reservationExpiresAt = getPaymentReservationExpiresAt(paymentExpiresAt);
		const reservationItems = itemsWithNames.map((item) => ({
			...item,
			orderItemId: randomUUID()
		}));
		let data;
		try {
			data = await runWithDbRetry(() =>
				prisma.$transaction(async (tx) => {
				const createdOrder = await tx.order.create({
					data: {
						userId: checkoutUserId,
						orderNumber: `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
						checkoutKey,
						guestEmail: customerEmail,
						guestPhone: customerPhone || null,
						subtotal: subtotalAmount,
						discountAmount,
						storeCreditApplied: storeCreditRedemption.totalApplied,
						totalAmount: finalOrderTotal,
						currency: orderCurrency,
						paymentMethod: paymentMethod,
						paymentExpiresAt: paymentMethod === 'monnify' ? paymentExpiresAt : null,
						deliveryMethod: isManualHandoverOrder ? 'whatsapp' : 'email',
						deliveryContact: customerEmail,
						deliveryStatus: isManualHandoverOrder ? 'processing' : 'pending',
						status: 'pending',
						orderType: isBoostingCheckout ? 'boosting' : isPhoneCheckout ? 'phone' : 'account',
						affiliateCode: attribution.affiliateCode || null,
						affiliateUserId: attribution.affiliateUserId || null,
						promotionId,
						promotionCode: appliedPromotionCode,
						analyticsMetadata: buildOrderAnalyticsMetadata(orderData.analytics),
						orderItems: {
							create: reservationItems.map((item) => ({
								id: item.orderItemId,
								categoryId: item.categoryId,
								quantity: item.quantity,
								unitPrice: item.unitPrice,
								totalPrice: item.unitPrice * item.quantity,
								productName: item.categoryName,
								productCategory: item.boostTargetUrl ? 'boosting_service' : 'tier',
								boostTargetUrl: item.boostTargetUrl,
								boostQuantity: item.boostQuantity,
								boostFulfillmentStatus: item.boostTargetUrl ? 'pending' : null
							}))
						}
					},
					include: {
						orderItems: {
							include: {
								accounts: true
							},
							orderBy: { createdAt: 'asc' }
						}
					}
				});

				await reserveStandardAccountsForOrder({
					client: tx,
					reservedUntil: reservationExpiresAt,
					// Manual-handover and auto-SMS items have no account inventory to reserve.
					items: reservationItems.filter(
						(item) =>
							!item.boostTargetUrl &&
							item.deliveryMode !== 'manual_handover' &&
							item.deliveryMode !== 'auto_sms'
					)
				});

				if (exactSelectionItems.length > 0) {
					await attachExactPreviewSelectionsToOrder({
						orderId: createdOrder.id,
						userId: checkoutUserId,
						client: tx,
						expiresAt: reservationExpiresAt,
						selections: reservationItems
							.filter((item) => Boolean(item.exactAccountId))
							.map((item) => ({
								categoryId: item.categoryId,
								accountId: item.exactAccountId as string,
								displayLabel: item.exactAccountLabel || undefined,
								orderItemId: item.orderItemId
							}))
					});
				}

					// Reserve (debit) store credit for this order. A failed/expired payment
					// reverses it via reverseStoreCreditRedemption.
					if (storeCreditRedemption.totalApplied > 0 && checkoutUserId) {
						await redeemStoreCreditForOrder(tx, {
							userId: checkoutUserId,
							orderId: createdOrder.id,
							orderNumber: createdOrder.orderNumber,
							redemption: storeCreditRedemption
						});
					}

				return createdOrder;
				})
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not reserve order stock.';
			if (message === 'INSUFFICIENT_STORE_CREDIT') {
				return json(
					{
						success: false,
						error: 'Your store credit balance changed — please refresh and try again.'
					},
					{ status: 409 }
				);
			}
			if (message.startsWith('STOCK_HOLD_INCOMPLETE:')) {
				const [, productName, requested, available] = message.split(':');
				return json(
					{
						success: false,
						error: `Only ${available} of ${requested} ${productName} accounts remain. Please refresh your cart.`
					},
					{ status: 409 }
				);
			}

			return json(
				{
					success: false,
					error: message
				},
				{ status: message.includes('exact account') ? 400 : 409 }
			);
		}

		// Invalidate admin stats cache after order creation
		invalidateAdminStatsCache();

		// Zero-charge order: store credit covers the full total, nothing to charge.
		// The credit was already reserved (redeemStoreCreditForOrder) inside the
		// create transaction. Skip Monnify — mark the order paid and fulfil via the
		// same proven path Monnify orders use (recoverPaidOrder: boosting / manual /
		// account allocation), then route the browser through /checkout/verify so the
		// buyer sees the standard success + delivery UI.
		if (isFullyCreditPaid) {
			await prisma.order.update({
				where: { id: data.id },
				data: {
					status: 'paid',
					paymentStatus: 'paid',
					paidAt: new Date(),
					paymentMethod: 'store_credit',
					paymentChannel: 'store_credit',
					paymentExpiresAt: null,
					paymentCheckoutUrl: null
				}
			});
			invalidateAdminStatsCache();
			logOrderStatusTransition({
				orderId: data.id,
				source: 'store_credit',
				fromStatus: data.status,
				toStatus: 'paid',
				fromPaymentStatus: data.paymentStatus,
				toPaymentStatus: 'paid'
			});

			const settlement = await recoverPaidOrder(data.id, 'store_credit').catch(
				(settleError) => {
					// Order is paid and the credit is reserved; the paid-order recovery
					// cron (and the verify page below) will retry fulfilment.
					console.error('Store-credit order fulfilment error:', settleError);
					return null;
				}
			);

			const verifyUrl = `${url.origin}/checkout/verify?orderId=${encodeURIComponent(data.id)}&method=store_credit`;
			return json({
				data,
				success: true,
				orderId: data.id,
				paidWithStoreCredit: true,
				redirectUrl: verifyUrl,
				deliveryMode: orderDeliveryMode,
				message: settlement?.warning || 'Paid with store credit. Your order is being processed.',
				error: null
			});
		}

		if (paymentMethod === 'monnify') {
			const shortOrderId = data.id.substring(0, 8);
			const paymentReference = `ORD_${shortOrderId}_${Date.now()}`;
			const redirectUrl = `${url.origin}/checkout/verify?orderId=${encodeURIComponent(data.id)}`;

			logPaymentEvent('info', 'checkout.initialize.started', {
				traceId,
				orderId: data.id,
				userId: checkoutUserId,
				paymentReference,
				amount: Number(data.totalAmount),
				currency: data.currency
			});

			const initResult = await initializeTransaction({
				amount: amountToCharge,
				currency: data.currency,
				customerName: locals.user.fullName || customerEmail || 'Customer',
				customerEmail,
				paymentReference,
				paymentDescription: `Payment for order ${shortOrderId}`,
				redirectUrl,
				metaData: { orderId: data.id, userId: checkoutUserId },
				traceId,
				orderId: data.id
			});

			if (!initResult.success || !initResult.checkoutUrl) {
				logPaymentEvent('error', 'checkout.initialize.failed', {
					traceId,
					orderId: data.id,
					userId: checkoutUserId,
					paymentReference,
					amount: Number(data.totalAmount),
					currency: data.currency,
					errorCode: initResult.errorCode,
					errorMessage: initResult.error || 'Failed to initialize payment'
				});
				try {
					await releaseOrderReservations(data.id);
					if (storeCreditRedemption.totalApplied > 0 && checkoutUserId) {
						await prisma.$transaction((tx) =>
							reverseStoreCreditRedemption(tx, { userId: checkoutUserId, orderId: data.id })
						);
					}
					await prisma.order.update({
						where: { id: data.id },
						data: {
							status: 'failed',
							paymentStatus: 'failed',
							checkoutKey: null,
							paymentCheckoutUrl: null,
							cancellationReason: 'init_failed'
						}
					});
					invalidateAdminStatsCache();
				} catch (markFailedError) {
					console.error('Failed to mark order failed after Monnify init failure:', markFailedError);
				}

				return json(
					{
						success: false,
						error: initResult.error || 'Failed to initialize payment',
						traceId
					},
					{ status: 502 }
				);
			}

			await prisma.order.update({
				where: { id: data.id },
				data: {
					paymentReference,
					paymentCheckoutUrl: initResult.checkoutUrl,
					paymentExpiresAt,
					status: 'pending_payment',
					paymentStatus: 'pending'
				}
			});
			invalidateAdminStatsCache();

			logPaymentEvent('info', 'checkout.initialize.completed', {
				traceId,
				orderId: data.id,
				userId: checkoutUserId,
				paymentReference,
				transactionReference: initResult.transactionReference,
				amount: Number(data.totalAmount),
				currency: data.currency,
				success: true
			});

			return json({
				data,
				success: true,
				orderId: data.id,
				checkoutUrl: initResult.checkoutUrl,
				paymentReference,
				deliveryMode: orderDeliveryMode,
				traceId,
				error: null
			});
		}

		if (isManualHandoverOrder) {
			await prisma.order.update({
				where: { id: data.id },
				data: {
					status: 'paid',
					paymentStatus: 'paid',
					deliveryStatus: 'processing',
					deliveryMethod: 'whatsapp',
					paidAt: new Date()
				}
			});
			invalidateAdminStatsCache();

			if (data.affiliateCode && data.affiliateUserId) {
				const creditResult = await recordAffiliateStoreCreditForOrder(data.id);
				if (!creditResult.success) {
					console.error(
						'Failed to record affiliate store credit for manual handover order:',
						creditResult.error
					);
				}
			}

			void maybeSendAffiliateUnlockInvite(checkoutUserId).catch((inviteError) => {
				console.error(
					'Failed to evaluate affiliate unlock after manual handover order:',
					inviteError
				);
			});

			return json({
				data,
				success: true,
				orderId: data.id,
				deliveryMode: orderDeliveryMode,
				message: 'Payment confirmed. Manual handover is now in progress.',
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
					deliveryMode: orderDeliveryMode,
					message:
						'Order created and fulfilled successfully! Check your email for account details.',
					error: null
				});
			}

			return json({
				data,
				success: true,
				orderId: data.id,
				deliveryMode: orderDeliveryMode,
				warning: 'Order created but fulfillment failed: ' + fulfillmentResult.error,
				error: null
			});
		} catch (fulfillmentError) {
			console.error('Order fulfillment error:', fulfillmentError);
			return json({
				data,
				success: true,
				orderId: data.id,
				deliveryMode: orderDeliveryMode,
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
