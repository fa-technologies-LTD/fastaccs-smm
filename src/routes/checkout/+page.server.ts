import type { PageServerLoad } from './$types';
import { readAffiliateReferralCookie } from '$lib/services/affiliate';
import { getStoreCreditBuckets } from '$lib/services/store-credit';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const affiliateRef = readAffiliateReferralCookie(cookies);

	// Available store credit for the signed-in buyer (drives the "Apply store
	// credit" toggle). Guests have none; never let this block checkout.
	let storeCredit = { earnedAvailable: 0, refundAvailable: 0, totalAvailable: 0 };
	if (locals.user?.id) {
		try {
			const buckets = await getStoreCreditBuckets(locals.user.id);
			storeCredit = {
				earnedAvailable: buckets.earnedAvailable,
				refundAvailable: buckets.refundAvailable,
				totalAvailable: buckets.earnedAvailable + buckets.refundAvailable
			};
		} catch (error) {
			console.error('Failed to load store credit for checkout:', error);
		}
	}

	// The buyer's own unlocked, unused promo code (spend-milestone reward) — surfaced as a
	// one-tap "apply your ₦X" tag on account checkouts. Applies to accounts only.
	let availablePromo: { code: string; value: number; minOrderValue: number } | null = null;
	if (locals.user?.id) {
		try {
			const now = new Date();
			const promo = await prisma.promotionCode.findFirst({
				where: {
					issuedToUserId: locals.user.id,
					isActive: true,
					usageCount: 0,
					OR: [{ endsAt: null }, { endsAt: { gt: now } }]
				},
				select: { code: true, value: true, minOrderValue: true },
				orderBy: { createdAt: 'desc' }
			});
			if (promo) {
				availablePromo = {
					code: promo.code,
					value: Number(promo.value),
					minOrderValue: Number(promo.minOrderValue)
				};
			}
		} catch (error) {
			console.error('Failed to load available promo for checkout:', error);
		}
	}

	return { affiliateRef: affiliateRef || null, storeCredit, availablePromo };
};
