// Google OAuth setup using Arctic
import { Google } from 'arctic';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';

// Use environment-based callback URL
const callbackURL = PUBLIC_BASE_URL
	? `${PUBLIC_BASE_URL}/auth/google/callback`
	: 'http://localhost:5173/auth/google/callback';

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackURL);
