import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	enableAffiliateMode,
	getAffiliateDashboardState,
	getAffiliateReferralBaseUrl
} from '$lib/services/affiliate';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const result = await enableAffiliateMode(user.id);

	if (!result.success || !result.affiliateCode) {
		return json({ success: false, error: result.error }, { status: 400 });
	}

	const referralLink = `${getAffiliateReferralBaseUrl()}/ref/${result.affiliateCode}`;
	const dashboard = await getAffiliateDashboardState(user.id);

	return json({
		success: true,
		affiliateCode: result.affiliateCode,
		referralLink,
		dashboard
	});
};
