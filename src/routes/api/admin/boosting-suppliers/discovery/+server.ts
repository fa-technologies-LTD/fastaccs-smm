import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getBoostProviderDiscovery } from '$lib/server/boosting-providers/discovery';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, setHeaders, url }) => {
	if (!hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}

	const data = await getBoostProviderDiscovery({ force: url.searchParams.get('force') === '1' });
	setHeaders({ 'cache-control': 'private, no-store' });
	return json({ success: true, data });
};
