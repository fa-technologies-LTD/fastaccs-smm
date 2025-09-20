// import { redirect } from '@sveltejs/kit';
import { auth, type AuthState } from '$lib/stores/auth';
import { get } from 'svelte/store';
// import { ADMIN_EMAILS } from '$env/static/private';

export async function load({ url }) {
	const authState: AuthState = get(auth);

	// No authentication required - removed auth guards for unrestricted access
	// Original auth guard logic is commented out below:
	/*
	// Check if user is authenticated
	if (!authState.user) {
		throw redirect(302, `/auth/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	// Check if user is admin using environment variable configuration
	const adminEmails = ADMIN_EMAILS ? ADMIN_EMAILS.split(',').map((email) => email.trim()) : [];
	const isAdmin = adminEmails.includes(authState.user.email || '');

	if (!isAdmin) {
		throw redirect(302, '/dashboard?error=access_denied');
	}
	*/

	return {
		url: url.pathname,
		user: authState.user, // Still pass user data for optional display
		isAdmin: true // Always allow access
	};
}
