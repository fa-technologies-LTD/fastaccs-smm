import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validatePromotionCode } from '$lib/services/promotions';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json().catch(() => ({}));
	const code = String(payload?.code || '');
	const subtotal = Number(payload?.subtotal || 0);
	const categoryIds = Array.isArray(payload?.categoryIds)
		? payload.categoryIds.filter((value: unknown): value is string => typeof value === 'string')
		: [];

	const result = await validatePromotionCode({
		code,
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
			code: result.promotion?.code || code,
			type: result.promotion?.type || null,
			value: Number(result.promotion?.value || 0),
			currency: result.promotion?.currency || 'NGN',
			discountAmount: result.discountAmount,
			finalTotal: result.finalTotal
		}
	});
};
