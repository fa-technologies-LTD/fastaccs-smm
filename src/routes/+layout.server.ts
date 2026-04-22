import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Pass user and session data from hooks.server.ts to all pages
	return {
		user: locals.user,
		session: locals.session,
		currentPath: url.pathname
	};
};
