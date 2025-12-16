// Google OAuth setup using Arctic
import { Google } from 'arctic';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { dev } from '$app/environment';

// Use environment-based callback URL
const callbackURL = dev
	? 'http://localhost:5173/auth/google/callback'
	: `${PUBLIC_BASE_URL}/auth/google/callback`;

export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackURL);
