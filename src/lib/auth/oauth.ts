// Google OAuth setup using Arctic
import { Google } from 'arctic';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { dev } from '$app/environment';

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function getGoogleCallbackUrl(origin?: string): string {
	const runtimeOrigin = origin?.trim();
	if (runtimeOrigin) {
		return `${normalizeBaseUrl(runtimeOrigin)}/auth/google/callback`;
	}

	if (dev) {
		const localBase = publicEnv.PUBLIC_BASE_URL?.trim() || 'http://localhost:5173';
		return `${normalizeBaseUrl(localBase)}/auth/google/callback`;
	}

	const publicBase = publicEnv.PUBLIC_SITE_URL?.trim() || publicEnv.PUBLIC_BASE_URL?.trim() || 'https://smm.fastaccs.com';
	return `${normalizeBaseUrl(publicBase)}/auth/google/callback`;
}

export function getGoogleClient(origin?: string): Google {
	const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
	const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();

	if (!clientId || !clientSecret) {
		throw new Error('Google OAuth credentials are not configured');
	}

	return new Google(clientId, clientSecret, getGoogleCallbackUrl(origin));
}
