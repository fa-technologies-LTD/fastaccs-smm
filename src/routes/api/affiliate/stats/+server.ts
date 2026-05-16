import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAffiliateDashboardState, getAffiliateStats } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const [legacyStats, dashboard] = await Promise.all([
		getAffiliateStats(user.id),
		getAffiliateDashboardState(user.id)
	]);

	return json({
		success: true,
		data: {
			program: legacyStats.success ? legacyStats.data : null,
			dashboard
		}
	});
};
