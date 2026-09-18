import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const admin = await parent();
	if (!admin.adminPermissions?.includes('admin:catalog:manage')) {
		throw error(403, 'Catalogue permission is required to preview Boosting offers.');
	}
	return {};
};
