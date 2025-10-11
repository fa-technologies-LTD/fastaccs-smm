import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Check if user is authenticated
	if (!locals.user || !locals.session) {
		throw redirect(303, `/auth/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	// Check if user is admin
	if (locals.user.userType !== 'ADMIN') {
		throw error(403, {
			message: 'Access denied. Admin privileges required.'
		});
	}

	return {
		user: locals.user,
		session: locals.session,
		isAdmin: true
	};
};
