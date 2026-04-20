import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { hashPassword } from '$lib/auth/password';
import { getUserTypeFromEmail } from '$lib/auth/admin';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/auth/session';

interface SignupPayload {
	email?: unknown;
	password?: unknown;
	fullName?: unknown;
	redirectTo?: unknown;
}

function normalizeEmail(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeRedirectPath(value: unknown): string {
	if (typeof value !== 'string') return '/dashboard';
	const trimmed = value.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/dashboard';
	return trimmed;
}

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as SignupPayload;
		const email = normalizeEmail(body.email);
		const password = typeof body.password === 'string' ? body.password : '';
		const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
		const redirectTo = sanitizeRedirectPath(body.redirectTo);

		if (!isValidEmail(email)) {
			return json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 });
		}

		if (password.length < 8) {
			return json(
				{ success: false, error: 'Password must be at least 8 characters.' },
				{ status: 400 }
			);
		}

		const existingUser = await prisma.user.findUnique({
			where: { email },
			select: {
				id: true,
				googleId: true,
				passwordHash: true
			}
		});

		if (existingUser) {
			if (existingUser.googleId && !existingUser.passwordHash) {
				return json(
					{
						success: false,
						error: 'This email is already linked to Google sign-in. Continue with Google to access it.'
					},
					{ status: 409 }
				);
			}

			return json(
				{ success: false, error: 'An account with this email already exists.' },
				{ status: 409 }
			);
		}

		const passwordHash = await hashPassword(password);
		const firstNameFallback = email.split('@')[0];

		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				fullName: fullName || firstNameFallback,
				userType: getUserTypeFromEmail(email),
				emailVerified: false,
				emailVerifiedAt: null,
				registeredAt: new Date(),
				lastLogin: new Date()
			}
		});

		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		const verifyRedirect = `/verify-email?next=${encodeURIComponent(redirectTo)}`;
		return json({
			success: true,
			redirectTo: verifyRedirect
		});
	} catch (error) {
		console.error('Signup error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create account'
			},
			{ status: 500 }
		);
	}
};
