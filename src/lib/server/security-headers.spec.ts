import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from './security-headers';

describe('security headers', () => {
	it('adds browser hardening without discarding existing response headers', async () => {
		const response = applySecurityHeaders(
			new Response('ok', {
				status: 201,
				headers: { 'cache-control': 'private', 'x-existing': 'kept' }
			})
		);

		expect(response.status).toBe(201);
		expect(await response.text()).toBe('ok');
		expect(response.headers.get('cache-control')).toBe('private');
		expect(response.headers.get('x-existing')).toBe('kept');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('x-frame-options')).toBe('DENY');
		expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('permissions-policy')).toContain('camera=()');
		expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
		expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
	});

	it('does not override a route-specific security policy', () => {
		const response = applySecurityHeaders(
			new Response(null, {
				status: 302,
				headers: {
					location: '/next',
					'content-security-policy': "default-src 'none'"
				}
			})
		);

		expect(response.headers.get('location')).toBe('/next');
		expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
	});
});
