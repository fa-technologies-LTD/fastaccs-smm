// Google OAuth login initiation
import { redirect } from '@sveltejs/kit';
import { generateState, generateCodeVerifier } from 'arctic';
import { getGoogleClient } from '$lib/auth/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const google = getGoogleClient(url.origin);

	// Get redirect URL from query params, default to dashboard
	const redirectTo = url.searchParams.get('redirectTo') || '/dashboard';

	// Create Google OAuth URL with required scopes
	const authUrl = google.createAuthorizationURL(state, codeVerifier, [
		'openid',
		'profile',
		'email'
	]);
	authUrl.searchParams.set('prompt', 'select_account');

	// Local HTTP development must not use secure cookies or callback state will be lost.
	const isSecureRequest = url.protocol === 'https:';

	// Cookie settings that work in both local and production
	const cookieOptions = {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10, // 10 minutes
		sameSite: 'lax' as const,
		secure: isSecureRequest
	};

	// Store state, code verifier, and redirect URL in cookies
	cookies.set('google_oauth_state', state, cookieOptions);
	cookies.set('google_code_verifier', codeVerifier, cookieOptions);
	cookies.set('auth_redirect_to', redirectTo, cookieOptions);

	// Redirect to Google OAuth page
	throw redirect(302, authUrl.toString());
};
