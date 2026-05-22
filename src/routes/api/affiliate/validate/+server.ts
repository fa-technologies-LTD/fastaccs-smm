import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAffiliateDiscountPreviewForCode,
	getLockedReferralForUser,
	validateAffiliateCode
} from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals, url }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		return json({ valid: false, error: 'Code parameter is required' }, { status: 400 });
	}

	const basic = await validateAffiliateCode(code);
	if (!basic.valid) {
		return json({ valid: false, error: basic.error || 'Invalid affiliate code.' });
	}

	if (!locals.user?.id) {
		return json({
			valid: true,
			userId: basic.userId,
			affiliateProgramId: basic.affiliateProgramId,
			affiliateCode: basic.affiliateCode
		});
	}

	const subtotal = Number(url.searchParams.get('subtotal') || 0);
	const [preview, locked] = await Promise.all([
		getAffiliateDiscountPreviewForCode({
			buyerUserId: locals.user.id,
			affiliateCode: code,
			subtotalAmount: subtotal
		}),
		getLockedReferralForUser(locals.user.id)
	]);

	return json({
		valid: preview.valid,
		error: preview.error,
		userId: basic.userId,
		affiliateProgramId: basic.affiliateProgramId,
		affiliateCode: basic.affiliateCode,
		discountAmount: preview.discountAmount,
		orderIndex: preview.orderIndex,
		stage: preview.stage,
		stageLabel: preview.stageLabel,
		ruleMode: preview.ruleMode,
		remainingRewardedOrders: preview.remainingRewardedOrders,
		expiresAfterOrder: preview.expiresAfterOrder,
		maxRewardedOrders: preview.maxRewardedOrders,
		lockedCode: locked?.affiliateCode || null
	});
};
