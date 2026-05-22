import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAffiliateDashboardState } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
