import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enableAffiliateMode } from '$lib/services/affiliate';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const result = await enableAffiliateMode(user.id);

	if (!result.success) {
		return json({ success: false, error: result.error }, { status: 400 });
	}

	const referralLink = `${process.env.PUBLIC_SITE_URL || 'https://fastaccs.vercel.app'}/?ref=${result.affiliateCode}`;

	return json({
		success: true,
		affiliateCode: result.affiliateCode,
		referralLink
	});
};
