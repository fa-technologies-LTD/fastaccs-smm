import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { getBoostingAnalytics } from '$lib/services/boosting-analytics';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:access'))
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		return json({ success: true, data: await getBoostingAnalytics(canViewRevenue(locals)) });
	} catch {
		return json({ success: false, error: 'Could not load Boosting analytics.' }, { status: 503 });
	}
};
