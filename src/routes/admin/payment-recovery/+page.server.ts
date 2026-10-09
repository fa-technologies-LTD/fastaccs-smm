import { redirect } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:orders:manage'))
		redirect(303, '/admin');
};
