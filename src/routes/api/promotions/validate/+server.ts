import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePromotionCode } from '$lib/services/promotions';
import {
	getAffiliateDiscountPreviewForCode,
	getLockedReferralForUser,
	validateAffiliateCode
} from '$lib/services/affiliate';

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
		const preview = await getAffiliateDiscountPreviewForCode({
			buyerUserId: locals.user.id,
			affiliateCode: normalizedCode,
			subtotalAmount: subtotal
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
