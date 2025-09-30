// import { redirect } from '@sveltejs/kit';
import { auth, type AuthState } from '$lib/stores/auth';
import { get } from 'svelte/store';
// import { ADMIN_EMAILS } from '$env/static/private';

export async function load({ url }) {
	const authState: AuthState = get(auth);

	// Temporarily allow access without auth for testing
	// TODO: Re-enable proper admin authentication once RLS policies are configured

	return {
		url: url.pathname,
		user: authState.user, // Still pass user data for optional display
		isAdmin: true // Always allow access
	};
}
