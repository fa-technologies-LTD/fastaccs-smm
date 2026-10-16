import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { prisma } from '$lib/prisma';
import {
	MAX_PASSWORD_BYTES,
	MIN_PASSWORD_LENGTH,
	getPasswordByteLength,
	hashPassword
} from '$lib/auth/password';
import { invalidateUserSessions } from '$lib/auth/session';
import { sendEmail } from '$lib/services/email';
import { getSiteBaseUrl } from '$lib/helpers/site-url';
import {
	PASSWORD_RESET_COOKIE,
	readPasswordResetUserId,
	verifyPasswordResetToken
} from '$lib/server/password-reset';
import {
	PASSWORD_RESET_RATE_LIMITS,
	checkRateLimit,
	getRequestClientIp,
	recordRateLimitAttempt
} from '$lib/auth/rate-limit';

const INVALID_LINK = 'This reset link is invalid or has expired. Request a new one.';

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json().catch(() => ({}))) as { password?: unknown };
		const password = typeof body.password === 'string' ? body.password : '';
		const token = event.cookies.get(PASSWORD_RESET_COOKIE) ?? null;
		const clearLink = () => event.cookies.delete(PASSWORD_RESET_COOKIE, { path: '/' });
		if (password.length < MIN_PASSWORD_LENGTH) {
			return json(
				{ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
				{ status: 400 }
			);
		}
		if (getPasswordByteLength(password) > MAX_PASSWORD_BYTES) {
			return json(
				{ success: false, error: `Password is too long. Maximum is ${MAX_PASSWORD_BYTES} bytes.` },
				{ status: 400 }
			);
		}

		const ipKey = `ip:${getRequestClientIp(event.request)}`;
		const ipLimit = await checkRateLimit({
			scope: 'password_reset_ip',
			key: ipKey,
			limit: PASSWORD_RESET_RATE_LIMITS.ip.limit,
			windowMs: PASSWORD_RESET_RATE_LIMITS.ip.windowMs
		});
		if (!ipLimit.allowed) {
			return json(
				{ success: false, error: 'Too many attempts. Please try again later.' },
				{ status: 429, headers: { 'retry-after': String(ipLimit.retryAfterSeconds) } }
			);
		}

		const userId = readPasswordResetUserId(token);
		const user = userId
			? await prisma.user.findUnique({
					where: { id: userId },
					select: {
						id: true,
						email: true,
						passwordHash: true,
						isActive: true,
						emailVerified: true
					}
				})
			: null;
		if (!user || !user.isActive || !user.passwordHash || !verifyPasswordResetToken(token, user)) {
			await recordRateLimitAttempt({ scope: 'password_reset_ip', key: ipKey, context: 'bad_link' });
			clearLink();
			return json({ success: false, error: INVALID_LINK }, { status: 400 });
		}

		// Only replace the exact hash the link was signed against: a second use of the same link,
		// even a concurrent one, finds the hash already changed and is refused.
		const now = new Date();
		const updated = await prisma.user.updateMany({
			where: { id: user.id, passwordHash: user.passwordHash },
			data: {
				passwordHash: await hashPassword(password),
				// Opening the emailed link proves the inbox belongs to them.
				...(user.emailVerified ? {} : { emailVerified: true, emailVerifiedAt: now })
			}
		});
		clearLink();
		if (updated.count !== 1) {
			return json({ success: false, error: INVALID_LINK }, { status: 400 });
		}

		// Sign out every device that used the old password.
		await invalidateUserSessions(user.id);

		if (user.email) {
			await sendEmail({
				to: user.email,
				userId: user.id,
				subject: 'Your FastAccs password was changed',
				body: [
					'Your FastAccs password was just changed, and other devices were signed out.',
					'If this wasn’t you, reset your password again right away and contact support.'
				].join('\n\n'),
				ctaText: 'Sign in',
				ctaUrl: `${getSiteBaseUrl()}/auth/login`,
				notificationType: 'password_reset',
				classification: 'transactional'
			}).catch((error) => console.error('Password change notice failed:', error));
		}

		return json({ success: true });
	} catch (error) {
		const traceId = randomUUID();
		console.error('Password reset confirm error:', { traceId, error });
		return json(
			{ success: false, error: `Something went wrong. Reference: ${traceId}` },
			{ status: 500 }
		);
	}
};
