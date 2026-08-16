import type { PageServerLoad } from './$types';
import { readAffiliateReferralCookie } from '$lib/services/affiliate';
import { getStoreCreditBuckets } from '$lib/services/store-credit';
import { prisma } from '$lib/prisma';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const affiliateRef = readAffiliateReferralCookie(cookies);
	const userId = locals.user?.id;
	const emptyStoreCredit = { earnedAvailable: 0, refundAvailable: 0, totalAvailable: 0 };

	const [storeCredit, availablePromo] = userId
		? await Promise.all([
				getStoreCreditBuckets(userId)
					.then((buckets) => ({
						earnedAvailable: buckets.earnedAvailable,
						refundAvailable: buckets.refundAvailable,
						totalAvailable: buckets.earnedAvailable + buckets.refundAvailable
					}))
					.catch((error) => {
						console.error('Failed to load store credit for checkout:', error);
						return emptyStoreCredit;
					}),
				prisma.promotionCode
					.findFirst({
						where: {
							issuedToUserId: userId,
							isActive: true,
							usageCount: 0,
							OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
						},
						select: { code: true, value: true, minOrderValue: true },
						orderBy: { createdAt: 'desc' }
					})
					.then((promo) =>
						promo
							? {
									code: promo.code,
									value: Number(promo.value),
									minOrderValue: Number(promo.minOrderValue)
								}
							: null
					)
					.catch((error) => {
						console.error('Failed to load available promo for checkout:', error);
						return null;
					})
			])
		: [emptyStoreCredit, null];

	return { affiliateRef: affiliateRef || null, storeCredit, availablePromo };
};
