import type { PageServerLoad } from './$types';
import { readAffiliateReferralCookie } from '$lib/services/affiliate';
import { getStoreCreditBuckets } from '$lib/services/store-credit';

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

	return { affiliateRef: affiliateRef || null, storeCredit };
};
