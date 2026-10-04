const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'self' https:",
	"script-src 'self' 'unsafe-inline' https:",
	"style-src 'self' 'unsafe-inline' https:",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data: https:",
	"connect-src 'self' https: wss:",
	'frame-src https:',
	"worker-src 'self' blob:",
	"manifest-src 'self'"
].join('; ');

export function applySecurityHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	headerSet(headers, 'content-security-policy', CONTENT_SECURITY_POLICY);
	headerSet(headers, 'x-content-type-options', 'nosniff');
	headerSet(headers, 'x-frame-options', 'DENY');
	headerSet(headers, 'referrer-policy', 'strict-origin-when-cross-origin');
	headerSet(headers, 'permissions-policy', 'camera=(), microphone=(), geolocation=()');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

function headerSet(headers: Headers, name: string, value: string): void {
	if (!headers.has(name)) headers.set(name, value);
}
