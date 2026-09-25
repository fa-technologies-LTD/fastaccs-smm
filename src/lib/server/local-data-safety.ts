export type LocalDataMode =
	| 'production-readonly'
	| 'production-preview'
	| 'production-e2e'
	| 'staging';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PRODUCTION_PREVIEW_POST_PATHS = new Set([
	'/api/auth/login',
	'/auth/logout',
	'/api/cart/refresh',
	'/api/push/subscribe',
	'/api/push/unsubscribe',
	'/api/affiliate/notifications/read'
]);

export function normalizeLocalDataMode(value: unknown): LocalDataMode {
	const normalized = String(value || '')
		.trim()
		.toLowerCase();
	if (
		normalized === 'staging' ||
		normalized === 'production-preview' ||
		normalized === 'production-e2e'
	) {
		return normalized;
	}
	return 'production-readonly';
}

/**
 * Local development defaults to production-readonly. Writes are allowed only when the developer
 * explicitly identifies either an isolated staging database or a deliberate one-session live E2E.
 * This makes an unset/mistyped variable fail safe instead of letting a localhost checkout mutate
 * the live ledger accidentally.
 */
function isLoopbackHostname(hostname: unknown): boolean {
	const normalized = String(hostname || '')
		.trim()
		.toLowerCase();
	return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function isLocalDataReadOnly(input: {
	dev: boolean;
	configuredMode: unknown;
	hostname?: string;
}): boolean {
	const runningLocally = input.dev || isLoopbackHostname(input.hostname);
	const mode = normalizeLocalDataMode(input.configuredMode);
	return runningLocally && (mode === 'production-readonly' || mode === 'production-preview');
}

export function shouldBlockLocalRequest(input: {
	dev: boolean;
	configuredMode: unknown;
	hostname?: string;
	method: string;
	pathname: string;
}): boolean {
	if (!isLocalDataReadOnly(input)) return false;
	const method = String(input.method || '').toUpperCase();
	const mode = normalizeLocalDataMode(input.configuredMode);
	if (mode === 'production-preview' && method === 'POST') {
		return !PRODUCTION_PREVIEW_POST_PATHS.has(input.pathname);
	}
	if (!SAFE_HTTP_METHODS.has(method)) return true;

	// Several cron routes intentionally mutate state despite using GET. Never let a local browser,
	// monitor, or copied cron URL run them against production-readonly data.
	return input.pathname.startsWith('/api/internal/cron/');
}

export function localReadOnlyResponse(pathname: string): Response {
	if (pathname.startsWith('/api/')) {
		return new Response(
			JSON.stringify({
				success: false,
				code: 'LOCAL_DATA_READ_ONLY',
				error:
					'Localhost is in production-readonly mode. Connect an isolated staging database before testing transactions.'
			}),
			{
				status: 503,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			}
		);
	}

	return new Response(
		'Localhost is in production-readonly mode. Connect an isolated staging database before testing transactions.',
		{ status: 503 }
	);
}
