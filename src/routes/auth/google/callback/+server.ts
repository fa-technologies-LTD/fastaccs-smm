// Google OAuth callback handler
import { redirect, error } from '@sveltejs/kit';
import { google } from '$lib/auth/oauth';
import { decodeIdToken } from 'arctic';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/auth/session';
import { getUserFromGoogleId, createUserFromGoogle, updateUserFromGoogle } from '$lib/auth/user';
import { isAdminEmail } from '$lib/auth/admin';
import type { RequestHandler } from './$types';
import type { OAuth2Tokens } from 'arctic';

export const GET: RequestHandler = async (event) => {
	const { url, cookies } = event;
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const codeVerifier = cookies.get('google_code_verifier');
	const redirectTo = cookies.get('auth_redirect_to') || '/dashboard';

	// Validate required parameters
	if (!code || !state || !storedState || !codeVerifier) {
		throw error(400, 'Invalid OAuth callback parameters');
	}

	// Validate state parameter (CSRF protection)
	if (state !== storedState) {
		throw error(400, 'Invalid OAuth state');
	}

	try {
		// Exchange authorization code for tokens
		const tokens: OAuth2Tokens = await google.validateAuthorizationCode(code, codeVerifier);

		// Decode the ID token to get user info
		const claims = decodeIdToken(tokens.idToken()) as {
			sub: string;
			email: string;
			name: string;
			picture?: string;
		};
		const googleUserId = claims.sub;
		const email = claims.email;
		const name = claims.name;
		const picture = claims.picture;

		if (!googleUserId || !email || !name) {
			throw error(400, 'Incomplete user data from Google');
		}

		// Check if user already exists
		let user = await getUserFromGoogleId(googleUserId);

		if (user) {
			// Update existing user's info and last login
			user = await updateUserFromGoogle(user.id, {
				sub: googleUserId,
				email,
				name,
				picture
			});
		} else {
			// Create new user
			user = await createUserFromGoogle({
				sub: googleUserId,
				email,
				name,
				picture
			});
		}

		// Create session
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);

		// Set session cookie
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		// Clear OAuth cookies
		cookies.delete('google_oauth_state', { path: '/' });
		cookies.delete('google_code_verifier', { path: '/' });
		cookies.delete('auth_redirect_to', { path: '/' });

		// Determine redirect destination
		let finalRedirectTo = redirectTo;

		// If no specific redirect was requested and user is admin, redirect to admin panel
		if (redirectTo === '/dashboard' && isAdminEmail(email)) {
			finalRedirectTo = '/admin';
		}

		// Redirect to intended destination
		throw redirect(302, finalRedirectTo);
	} catch (e) {
		// Don't catch redirects as errors
		if (e && typeof e === 'object' && 'status' in e && e.status === 302) {
			throw e;
		}

		// Log detailed error information
		console.error('OAuth callback error:', {
			error: e,
			message: e instanceof Error ? e.message : String(e),
			stack: e instanceof Error ? e.stack : undefined,
			hasCode: !!code,
			hasStoredState: !!storedState,
			hasCodeVerifier: !!codeVerifier,
			stateMatch: state === storedState
		});

		// Return more helpful error message
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		throw error(500, `Authentication failed: ${errorMessage}`);
	}
};
