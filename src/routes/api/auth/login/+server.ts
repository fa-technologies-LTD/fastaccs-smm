import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { verifyPassword } from '$lib/auth/password';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/auth/session';

interface LoginPayload {
	email?: unknown;
	password?: unknown;
	redirectTo?: unknown;
}

function normalizeEmail(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toLowerCase();
}

function sanitizeRedirectPath(value: unknown): string {
	if (typeof value !== 'string') return '/dashboard';
	const trimmed = value.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/dashboard';
	return trimmed;
}

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as LoginPayload;
		const email = normalizeEmail(body.email);
		const password = typeof body.password === 'string' ? body.password : '';
		const redirectTo = sanitizeRedirectPath(body.redirectTo);

		if (!email || !password) {
			return json(
				{ success: false, error: 'Email and password are required.' },
				{ status: 400 }
			);
		}

		const user = await prisma.user.findUnique({
			where: { email },
			select: {
				id: true,
				passwordHash: true,
				emailVerified: true,
				googleId: true
			}
		});

		if (!user || !user.passwordHash) {
			const message = user?.googleId
				? 'This account uses Google sign-in. Continue with Google.'
				: 'Invalid email or password.';
			return json({ success: false, error: message }, { status: 401 });
		}

		const isValidPassword = await verifyPassword(password, user.passwordHash);
		if (!isValidPassword) {
			return json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
		}

		await prisma.user.update({
			where: { id: user.id },
			data: { lastLogin: new Date() }
		});

		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		const finalRedirect = user.emailVerified
			? redirectTo
			: `/verify-email?next=${encodeURIComponent(redirectTo)}`;

		return json({
			success: true,
			redirectTo: finalRedirect
		});
	} catch (error) {
		console.error('Login error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Login failed'
			},
			{ status: 500 }
		);
	}
};
