// Google OAuth setup using Arctic
import { Google } from 'arctic';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { dev } from '$app/environment';

// Use environment-based callback URL
const callbackURL = dev
	? 'http://localhost:5173/auth/google/callback'
	: `${PUBLIC_BASE_URL || 'https://fastaccs.vercel.app'}/auth/google/callback`;

// Log the callback URL in development to help with debugging
if (dev) {
	console.log('OAuth Callback URL:', callbackURL);
} else if (!PUBLIC_BASE_URL) {
	console.warn(
		'PUBLIC_BASE_URL is not set, using fallback. Set it in Vercel environment variables.'
	);
}

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackURL);
