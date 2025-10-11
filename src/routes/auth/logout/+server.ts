// Logout handler
import { redirect } from '@sveltejs/kit';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { locals } = event;

	// If no session, just redirect
	if (!locals.session) {
		throw redirect(302, '/');
	}

	// Invalidate the session in database
	await invalidateSession(locals.session.id);

	// Delete session cookie
	deleteSessionTokenCookie(event);

	// Redirect to home page
	throw redirect(302, '/');
};
