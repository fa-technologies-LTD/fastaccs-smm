import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import planMarkdown from '../../../../BOOSTING_AUTOMATION_PLAN.md?raw';
import todoMarkdown from '../../../../PROJECT_TODO.md?raw';

export const load: PageServerLoad = async ({ parent }) => {
	const admin = await parent();
	if (!admin.adminPermissions?.includes('admin:settings:manage')) {
		throw error(403, 'Settings permission is required to review internal plans.');
	}

	return {
		planMarkdown,
		todoMarkdown
	};
};
