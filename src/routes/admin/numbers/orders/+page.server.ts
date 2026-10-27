import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { canViewOrderAmounts, canViewRevenue } from '$lib/services/admin-revenue-visibility';
import { listNumbersOrders } from '$lib/services/admin-numbers-orders';

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		redirect(303, '/admin');
	setHeaders({ 'cache-control': 'private, no-store' });
	const search = url.searchParams.get('q')?.trim() ?? '';
	const result = await listNumbersOrders({
		search,
		page: Number(url.searchParams.get('page') ?? 1) || 1,
		showOrderAmounts: canViewOrderAmounts(locals),
		showCosts: canViewRevenue(locals)
	});
	return { ...result, search, canViewRevenue: canViewRevenue(locals) };
};
