import type { LayoutServerLoad } from './$types';
import { toBrowserSession, toBrowserUser } from '$lib/auth/browser-session';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Only expose the browser-safe subset of authenticated account data.
	return {
		user: toBrowserUser(locals.user),
		session: toBrowserSession(locals.session),
		currentPath: url.pathname
	};
};
