import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

// Exercise the exact cookie dependency resolved by SvelteKit, not an unrelated copy.
const requireFromProject = createRequire(import.meta.url);
const requireFromKit = createRequire(requireFromProject.resolve('@sveltejs/kit/package.json'));
const { parse, serialize } = requireFromKit('cookie');

it('preserves session-cookie encoding and the options used by authentication', () => {
	const value = 'test-session/with+special=characters';
	const cookie = serialize('auth_session', value, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 3600
	});
	expect(parse(cookie).auth_session).toBe(value);
	expect(cookie).toContain('HttpOnly');
	expect(cookie).toContain('Secure');
	expect(cookie).toContain('SameSite=Lax');
});

it.each([
	() => serialize('session; Max-Age=0', 'value'),
	() => serialize('session', 'value', { path: '/; Max-Age=0' }),
	() => serialize('session', 'value', { domain: 'example.com; Max-Age=0' })
])('rejects cookie-field injection in the framework dependency', (attempt) => {
	expect(attempt).toThrow(TypeError);
});
