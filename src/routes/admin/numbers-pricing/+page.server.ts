import { error } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { loadNumbersPricingView } from '$lib/server/numbers-pricing-sheet';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		throw error(403, 'Catalogue permission is required.');
	setHeaders({ 'cache-control': 'private, no-store' });
	return { pricing: await loadNumbersPricingView() };
};
