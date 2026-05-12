import { redirect } from '@sveltejs/kit';
import { sanitizeInternalRedirectPath } from '$lib/auth/redirect';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const next = sanitizeInternalRedirectPath(url.searchParams.get('redirectTo'));
	const error = url.searchParams.get('error');

	// If there's an error parameter from OAuth provider
	if (error) {
		console.error('OAuth provider error:', error);
		throw redirect(303, `/auth/login?error=${encodeURIComponent(error)}`);
	}

	// TODO: Implement proper OAuth callback handling with Prisma-based auth
	// For now, redirect to login
	console.log('Auth callback - redirecting to:', next);
	throw redirect(303, next);
};
