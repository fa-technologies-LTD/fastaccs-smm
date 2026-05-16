import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAffiliateDashboardState, requestAffiliatePayout } from '$lib/services/affiliate';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const result = await requestAffiliatePayout(locals.user.id);
	if (!result.success) {
		return json(
			{ success: false, error: result.error || 'Failed to submit payout request.' },
			{ status: 400 }
		);
	}

	const dashboard = await getAffiliateDashboardState(locals.user.id);
	return json({
		success: true,
		amount: result.amount || 0,
		dashboard
	});
};
