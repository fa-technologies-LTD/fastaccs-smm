import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePromotionCode } from '$lib/services/promotions';
import {
	getAffiliateDiscountPreviewForCode,
	getLockedReferralForUser,
	validateAffiliateCode
} from '$lib/services/affiliate';
import { prisma } from '$lib/prisma';

interface PromoValidationItemInput {
	categoryId: string;
	quantity: number;
	unitPrice: number;
	totalPrice?: number;
	productName?: string;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const rawCode = String(payload?.code || '').trim();
	const normalizedCode = rawCode.toUpperCase();
	const subtotal = Number(payload?.subtotal || 0);
	const categoryIds = Array.isArray(payload?.categoryIds)
		? payload.categoryIds.filter((value: unknown): value is string => typeof value === 'string')
		: [];
	const inputItems: PromoValidationItemInput[] = Array.isArray(payload?.items)
		? payload.items
				.filter((value: unknown): value is Record<string, unknown> => {
					return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
				})
				.map((item: Record<string, unknown>) => ({
					categoryId: String(item.categoryId || '').trim(),
					quantity: Math.max(1, Number(item.quantity || 1)),
					unitPrice: Number(item.unitPrice || 0),
					totalPrice: Number(item.totalPrice || 0),
					productName: String(item.productName || '').trim()
				}))
				.filter((item: PromoValidationItemInput) => Boolean(item.categoryId))
		: [];

	if (!normalizedCode) {
		return json({ success: false, error: 'Promo code is required.', discountAmount: 0, finalTotal: subtotal });
	}

	const [lockedReferral, affiliateCandidate] = await Promise.all([
		getLockedReferralForUser(locals.user.id),
		validateAffiliateCode(normalizedCode)
	]);

	if (!affiliateCandidate.valid && lockedReferral) {
		return json({
			success: false,
			error:
				'Promo codes cannot be combined with an active affiliate referral. Complete checkout without a promo code.',
			discountAmount: 0,
			finalTotal: subtotal
		});
	}

	if (affiliateCandidate.valid) {
		const itemCategoryIds: string[] = [...new Set(inputItems.map((item) => item.categoryId))];
		const categories = itemCategoryIds.length
			? await prisma.category.findMany({
					where: { id: { in: itemCategoryIds } },
					select: {
						id: true,
						name: true,
						metadata: true
					}
				})
			: [];
		const categoryById = new Map(categories.map((category) => [category.id, category]));
		const orderItems = inputItems.map((item) => {
			const categoryId = item.categoryId;
			const category = categoryById.get(categoryId);
			const quantity = Math.max(1, Number(item.quantity || 1));
			const unitPrice = Number(item.unitPrice || 0);
			const totalPrice =
				Number.isFinite(Number(item.totalPrice)) && Number(item.totalPrice || 0) > 0
					? Number(item.totalPrice || 0)
					: Math.max(0, unitPrice * quantity);
			const productName = String(item.productName || category?.name || '').trim();

			return {
				quantity,
				totalPrice,
				productName,
				categoryMetadata: category?.metadata ?? {}
			};
		});

		const preview = await getAffiliateDiscountPreviewForCode({
			buyerUserId: locals.user.id,
			affiliateCode: normalizedCode,
			subtotalAmount: subtotal,
			orderItems
		});

		if (!preview.valid) {
			return json({
				success: false,
				error: preview.error || 'Affiliate code is not eligible for this checkout.',
				discountAmount: 0,
				finalTotal: subtotal
			});
		}

		const discountAmount = Number(preview.discountAmount || 0);
		const finalTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

		return json({
			success: true,
			data: {
				code: normalizedCode,
				type: 'AFFILIATE',
				value: 0,
				currency: 'NGN',
				discountAmount,
				finalTotal,
				meta: {
					orderIndex: preview.orderIndex,
					stage: preview.stage,
					stageLabel: preview.stageLabel,
					ruleMode: preview.ruleMode,
					remainingRewardedOrders: preview.remainingRewardedOrders,
					expiresAfterOrder: preview.expiresAfterOrder,
					maxRewardedOrders: preview.maxRewardedOrders,
					lockedCode: preview.lockedCode || null
				}
			}
		});
	}

	const result = await validatePromotionCode({
		code: normalizedCode,
		userId: locals.user.id,
		subtotal,
		categoryIds
	});

	if (!result.valid) {
		return json({
			success: false,
			error: result.error || 'Promo code is invalid.',
			discountAmount: 0,
			finalTotal: subtotal
		});
	}

	return json({
		success: true,
		data: {
			code: result.promotion?.code || normalizedCode,
			type: result.promotion?.type || null,
			value: Number(result.promotion?.value || 0),
			currency: result.promotion?.currency || 'NGN',
			discountAmount: result.discountAmount,
			finalTotal: result.finalTotal
		}
	});
};
