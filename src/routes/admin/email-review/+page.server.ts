import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getEmailReviewCatalog } from '$lib/services/email-review-catalog.server';

export const load: PageServerLoad = async ({ parent, setHeaders }) => {
	const admin = await parent();
	if (!admin.adminPermissions?.includes('admin:settings:manage')) {
		throw error(403, 'Settings permission is required to review email copy.');
	}

	setHeaders({ 'cache-control': 'private, no-store' });
	return { entries: getEmailReviewCatalog() };
};
