import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { MAX_PASSWORD_BYTES, getPasswordByteLength, verifyPassword } from '$lib/auth/password';
import { createSession, generateSessionToken, setSessionTokenCookie } from '$lib/auth/session';
import { getUserTypeFromEmail } from '$lib/auth/admin';
import {
	LOGIN_RATE_LIMITS,
	checkRateLimit,
	getRequestClientIp,
	recordRateLimitAttempt
} from '$lib/auth/rate-limit';

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
		const clientIp = getRequestClientIp(event.request);
		const ipKey = `ip:${clientIp}`;
		const identityKey = `email:${email || 'unknown'}|ip:${clientIp}`;

		const [ipLimitState, identityLimitState] = await Promise.all([
			checkRateLimit({
				scope: 'login_ip',
				key: ipKey,
				limit: LOGIN_RATE_LIMITS.ip.limit,
				windowMs: LOGIN_RATE_LIMITS.ip.windowMs
			}),
			checkRateLimit({
				scope: 'login_identity',
				key: identityKey,
				limit: LOGIN_RATE_LIMITS.identity.limit,
				windowMs: LOGIN_RATE_LIMITS.identity.windowMs
			})
		]);

		if (!ipLimitState.allowed || !identityLimitState.allowed) {
			const retryAfterSeconds = Math.max(
				ipLimitState.retryAfterSeconds,
				identityLimitState.retryAfterSeconds
			);
			return json(
				{
					success: false,
					error: `Too many login attempts. Try again in ${retryAfterSeconds}s.`
				},
				{ status: 429, headers: { 'retry-after': String(retryAfterSeconds) } }
			);
		}

		const registerFailedAttempt = async (reason: string) => {
			await Promise.allSettled([
				recordRateLimitAttempt({
					scope: 'login_ip',
					key: ipKey,
					context: reason
				}),
				recordRateLimitAttempt({
					scope: 'login_identity',
					key: identityKey,
					context: reason
				})
			]);
		};

		if (!email || !password) {
			await registerFailedAttempt('missing_credentials');
			return json(
				{ success: false, error: 'Email and password are required.' },
				{ status: 400 }
			);
		}

		if (getPasswordByteLength(password) > MAX_PASSWORD_BYTES) {
			await registerFailedAttempt('password_too_long');
			return json(
				{
					success: false,
					error: `Password is too long. Maximum allowed is ${MAX_PASSWORD_BYTES} bytes.`
				},
				{ status: 400 }
			);
		}

			const user = await prisma.user.findUnique({
				where: { email },
				select: {
					id: true,
					passwordHash: true,
					emailVerified: true,
					googleId: true,
					isActive: true,
					userType: true
				}
			});

		if (!user || !user.passwordHash) {
			await registerFailedAttempt('unknown_user_or_passwordless');
			const message = user?.googleId
				? 'This account uses Google sign-in. Continue with Google.'
				: 'Invalid email or password.';
			return json({ success: false, error: message }, { status: 401 });
		}

		const isValidPassword = await verifyPassword(password, user.passwordHash);
		if (!isValidPassword) {
			await registerFailedAttempt('invalid_password');
			return json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
		}

		if (!user.isActive) {
			return json(
				{
					success: false,
					error: 'Your account is currently suspended. Please contact support.'
				},
				{ status: 403 }
			);
		}

			await prisma.user.update({
				where: { id: user.id },
				data: {
					lastLogin: new Date(),
					...(getUserTypeFromEmail(email) === 'ADMIN' ? { userType: 'ADMIN' as const } : {})
				}
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
