import type { LayoutServerLoad } from './$types';
import { toBrowserSession, toBrowserUser } from '$lib/auth/browser-session';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Only expose the browser-safe subset of authenticated account data.
	return {
		user: toBrowserUser(locals.user),
		session: toBrowserSession(locals.session),
		currentPath: url.pathname,
		// Server's view of the visitor's cookie choice, so the browser can reconcile on load.
		attributionState: {
			level: locals.attribution?.consentLevel ?? null,
			hasFirst: Boolean(locals.attribution?.first),
			hasLast: Boolean(locals.attribution?.last)
		}
	};
};
