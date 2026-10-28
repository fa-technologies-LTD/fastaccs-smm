import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { isHiddenFromMicrocopy } from '$lib/helpers/promo-campaign-rules';

// Business rules: the saved config.* values, moved out of Site Text so money rules never sit next
// to button wording. Same storage and same editor as before.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminContext || !hasAdminPermission(locals.adminContext, 'admin:settings:manage'))
		redirect(303, '/admin');
	const rows = await prisma.microcopy.findMany({
		where: { key: { startsWith: 'config.' } },
		orderBy: [{ category: 'asc' }, { key: 'asc' }]
	});
	return { microcopy: rows.filter((row) => !isHiddenFromMicrocopy(row.key)) };
};
