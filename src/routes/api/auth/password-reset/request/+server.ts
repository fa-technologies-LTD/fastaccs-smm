import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { prisma } from '$lib/prisma';
import { sendEmail } from '$lib/services/email';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import { createPasswordResetToken, isPasswordResetConfigured } from '$lib/server/password-reset';
import {
	PASSWORD_RESET_RATE_LIMITS,
	checkRateLimit,
	getRequestClientIp,
	recordRateLimitAttempt
} from '$lib/auth/rate-limit';

// The same answer whether or not an account exists, so the form cannot be used to find accounts.
const GENERIC_MESSAGE =
	'If an account exists for that email, we’ve sent a reset link. Check your inbox and spam folder.';

function normalizeEmail(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json().catch(() => ({}))) as { email?: unknown };
		const email = normalizeEmail(body.email);
		if (!email || email.length > 254 || !email.includes('@')) {
			return json(
				{ success: false, error: 'Enter the email you signed up with.' },
				{ status: 400 }
			);
		}
		if (!isPasswordResetConfigured()) {
			return json(
				{
					success: false,
					error: 'Password reset is unavailable right now. Please contact support.'
				},
				{ status: 503 }
			);
		}

		const clientIp = getRequestClientIp(event.request);
		const ipKey = `ip:${clientIp}`;
		const identityKey = `email:${email}`;
		const [ipLimit, identityLimit] = await Promise.all([
			checkRateLimit({
				scope: 'password_reset_ip',
				key: ipKey,
				limit: PASSWORD_RESET_RATE_LIMITS.ip.limit,
				windowMs: PASSWORD_RESET_RATE_LIMITS.ip.windowMs
			}),
			checkRateLimit({
				scope: 'password_reset_identity',
				key: identityKey,
				limit: PASSWORD_RESET_RATE_LIMITS.identity.limit,
				windowMs: PASSWORD_RESET_RATE_LIMITS.identity.windowMs
			})
		]);
		if (!ipLimit.allowed || !identityLimit.allowed) {
			const retryAfterSeconds = Math.max(
				ipLimit.retryAfterSeconds,
				identityLimit.retryAfterSeconds
			);
			return json(
				{
					success: false,
					error: `Too many reset requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} min.`
				},
				{ status: 429, headers: { 'retry-after': String(retryAfterSeconds) } }
			);
		}
		await Promise.allSettled([
			recordRateLimitAttempt({ scope: 'password_reset_ip', key: ipKey, context: 'request' }),
			recordRateLimitAttempt({
				scope: 'password_reset_identity',
				key: identityKey,
				context: 'request'
			})
		]);

		const user = await prisma.user.findUnique({
			where: { email },
			select: { id: true, email: true, passwordHash: true, googleId: true, isActive: true }
		});

		if (user?.isActive && user.email) {
			if (user.passwordHash) {
				const token = createPasswordResetToken(user);
				if (token) {
					await sendEmail({
						to: user.email,
						userId: user.id,
						subject: 'Reset your FastAccs password',
						body: [
							'We received a request to reset the password for your FastAccs account.',
							'This link works once and expires in 30 minutes.',
							'If you didn’t ask for this, you can ignore this email. Your password won’t change.'
						].join('\n\n'),
						ctaText: 'Reset password',
						ctaUrl: `${getSiteBaseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`,
						notificationType: 'password_reset',
						classification: 'transactional'
					});
				}
			} else if (user.googleId) {
				// Google-only accounts have no password to reset; tell them how they sign in.
				await sendEmail({
					to: user.email,
					userId: user.id,
					subject: 'How to sign in to FastAccs',
					body: [
						'We received a password reset request, but your FastAccs account uses Google sign-in.',
						'Open the sign-in page and choose “Continue with Google” using this email address.'
					].join('\n\n'),
					ctaText: 'Go to sign in',
					ctaUrl: `${getSiteBaseUrl()}/auth/login`,
					notificationType: 'password_reset',
					classification: 'transactional'
				});
			}
		}

		return json({ success: true, message: GENERIC_MESSAGE });
	} catch (error) {
		const traceId = randomUUID();
		console.error('Password reset request error:', { traceId, error });
		return json(
			{ success: false, error: `Something went wrong. Reference: ${traceId}` },
			{ status: 500 }
		);
	}
};
