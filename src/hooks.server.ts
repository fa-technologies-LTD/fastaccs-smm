// Server-side hooks for session management
import { validateSessionToken } from '$lib/auth/session';
import { startPaymentReconciliationScheduler } from '$lib/services/payment-reconciliation';
import type { Handle } from '@sveltejs/kit';

startPaymentReconciliationScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	// Skip CSRF check for webhook endpoints
	// if (event.url.pathname.startsWith('/api/webhooks/')) {
	// 	return resolve(event, {
	// 		filterSerializedResponseHeaders: (name) => name === 'content-type'
	// 	});
	// }

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
