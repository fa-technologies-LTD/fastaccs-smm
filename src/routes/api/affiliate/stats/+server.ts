import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAffiliateStats } from '$lib/services/affiliate';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const result = await getAffiliateStats(user.id);

	if (!result.success) {
		return json({ success: false, error: result.error }, { status: 404 });
	}

	return json({
		success: true,
		data: result.data
	});
};
