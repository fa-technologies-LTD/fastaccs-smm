import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAffiliateAccessSummary, getAffiliateDashboardState } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (url.searchParams.get('summary') === '1') {
		return json({
			success: true,
			data: { summary: await getAffiliateAccessSummary(user.id) }
		});
	}

	const dashboard = await getAffiliateDashboardState(user.id);

	return json({
		success: true,
		data: {
			program: null,
			dashboard
		}
	});
};
