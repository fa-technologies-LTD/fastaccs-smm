// Server-side hooks for session management
import { validateSessionToken } from '$lib/auth/session';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Get session token from cookies
	const sessionToken = event.cookies.get('session');

	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		// Validate session
		const { session, user } = await validateSessionToken(sessionToken);
		event.locals.session = session;
		event.locals.user = user;
	}

	return resolve(event);
};
