import type { PageServerLoad } from './$types';
import { readAffiliateReferralCookie } from '$lib/services/affiliate';

export const load: PageServerLoad = async ({ cookies }) => {
	const affiliateRef = readAffiliateReferralCookie(cookies);
	return { affiliateRef: affiliateRef || null };
};
