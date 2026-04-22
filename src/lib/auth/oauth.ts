// Google OAuth setup using Arctic
import { Google } from 'arctic';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
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
		const localBase = PUBLIC_BASE_URL?.trim() || 'http://localhost:5173';
		return `${normalizeBaseUrl(localBase)}/auth/google/callback`;
	}

	const publicBase =
		publicEnv.PUBLIC_SITE_URL?.trim() || PUBLIC_BASE_URL?.trim() || 'https://fastaccs-smm.vercel.app';
	return `${normalizeBaseUrl(publicBase)}/auth/google/callback`;
}

export function getGoogleClient(origin?: string): Google {
	return new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, getGoogleCallbackUrl(origin));
}

// Backward-compatible export for places that do not pass request origin.
export const google = getGoogleClient();
