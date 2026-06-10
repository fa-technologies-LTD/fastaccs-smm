import type { PageServerLoad } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { getAutomationDashboardSnapshot } from '$lib/services/automation-health';

export const load: PageServerLoad = async ({ locals }) => ({
	jobs: await getAutomationDashboardSnapshot(),
	canRunJobs: hasAdminPermission(locals.adminContext, 'admin:settings:manage')
});
