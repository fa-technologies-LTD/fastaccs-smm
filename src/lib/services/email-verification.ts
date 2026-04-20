import { env } from '$env/dynamic/private';
import { prisma } from '$lib/prisma';
import {
	generateVerificationCode,
	logEmailNotification,
	maskEmailAddress,
	sendEmail,
	sendWelcomeEmailIfNeeded
} from './email';

const MAX_VERIFICATION_REQUESTS_PER_HOUR = 3;
const MAX_VERIFICATION_ATTEMPTS_PER_CODE = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const parsedExpiryMinutes = Number(env.VERIFICATION_CODE_EXPIRY_MINUTES || 10);
const VERIFICATION_CODE_EXPIRY_MINUTES =
	Number.isFinite(parsedExpiryMinutes) && parsedExpiryMinutes > 0 ? parsedExpiryMinutes : 10;

interface MinimalUser {
	id: string;
	email: string | null;
	emailVerified: boolean;
	fullName?: string | null;
}

export interface VerificationEnsureResult {
	success: boolean;
	alreadyActive?: boolean;
	rateLimited?: boolean;
	retryAfterSeconds?: number;
	requestsRemaining?: number;
	error?: string;
}

export interface VerificationStatusResult {
	verified: boolean;
	maskedEmail: string | null;
	retryAfterSeconds: number;
	requestsRemaining: number;
	hasActiveCode: boolean;
	expiresAt: string | null;
}

function getRetryAfterSeconds(lastSentAt: Date | null): number {
	if (!lastSentAt) return 0;
	const elapsedMs = Date.now() - lastSentAt.getTime();
	const remainingMs = RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
	return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

async function getRequestsInLastHour(userId: string): Promise<number> {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	return prisma.emailNotification.count({
		where: {
			userId,
			notificationType: 'verification',
			referenceId: 'code_request',
			createdAt: { gte: oneHourAgo }
		}
	});
}

function getFirstName(fullName: string | null | undefined, fallbackEmail: string): string | null {
	if (fullName && fullName.trim()) {
		return fullName.trim().split(/\s+/)[0];
	}
	return fallbackEmail.split('@')[0] || null;
}

export async function getVerificationStatus(user: MinimalUser): Promise<VerificationStatusResult> {
	if (!user.email) {
		return {
			verified: user.emailVerified,
			maskedEmail: null,
			retryAfterSeconds: 0,
			requestsRemaining: 0,
			hasActiveCode: false,
			expiresAt: null
		};
	}

	const codeRecord = await prisma.verificationCode.findUnique({
		where: { userId: user.id }
	});
	const requestsUsed = await getRequestsInLastHour(user.id);
	const requestsRemaining = Math.max(MAX_VERIFICATION_REQUESTS_PER_HOUR - requestsUsed, 0);

	return {
		verified: user.emailVerified,
		maskedEmail: maskEmailAddress(user.email),
		retryAfterSeconds: getRetryAfterSeconds(codeRecord?.lastSentAt || null),
		requestsRemaining,
		hasActiveCode: Boolean(codeRecord && codeRecord.expiresAt.getTime() > Date.now()),
		expiresAt: codeRecord?.expiresAt?.toISOString() || null
	};
}

export async function ensureVerificationCode(
	user: MinimalUser,
	options: { forceResend?: boolean; ignoreRateLimits?: boolean } = {}
): Promise<VerificationEnsureResult> {
	if (!user.email) {
		return {
			success: false,
			error: 'No email is associated with this account.'
		};
	}

	if (user.emailVerified) {
		return {
			success: true,
			alreadyActive: false
		};
	}

	const existingCode = await prisma.verificationCode.findUnique({
		where: { userId: user.id }
	});
	const now = new Date();
	const activeCodeExists = Boolean(existingCode && existingCode.expiresAt.getTime() > now.getTime());

	if (activeCodeExists && !options.forceResend) {
		return {
			success: true,
			alreadyActive: true,
			retryAfterSeconds: getRetryAfterSeconds(existingCode?.lastSentAt || null)
		};
	}

	if (!options.ignoreRateLimits) {
		const retryAfterSeconds = getRetryAfterSeconds(existingCode?.lastSentAt || null);
		if (retryAfterSeconds > 0) {
			return {
				success: false,
				rateLimited: true,
				retryAfterSeconds,
				error: `Please wait ${retryAfterSeconds}s before requesting another code.`
			};
		}

		const requestsInHour = await getRequestsInLastHour(user.id);
		if (requestsInHour >= MAX_VERIFICATION_REQUESTS_PER_HOUR) {
			return {
				success: false,
				rateLimited: true,
				retryAfterSeconds: 60 * 60,
				requestsRemaining: 0,
				error: 'You have reached the maximum verification requests this hour.'
			};
		}
	}

	const code = generateVerificationCode();
	const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

	await prisma.verificationCode.upsert({
		where: { userId: user.id },
		update: {
			code,
			expiresAt,
			attempts: 0,
			lastSentAt: now,
			updatedAt: now
		},
		create: {
			userId: user.id,
			code,
			expiresAt,
			attempts: 0,
			lastSentAt: now,
			updatedAt: now
		}
	});

	const sendResult = await sendEmail({
		to: user.email,
		subject: 'Your Fast Accounts verification code',
		body: `Use this verification code to confirm your email: ${code}

This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.

Do not share this code with anyone.`,
		userId: user.id,
		notificationType: 'verification',
		referenceId: 'code_request',
		showCta: false
	});

	if (!sendResult.success) {
		return {
			success: false,
			error: sendResult.error || 'Failed to send verification code.'
		};
	}

	const requestsInHour = await getRequestsInLastHour(user.id);
	return {
		success: true,
		alreadyActive: false,
		retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
		requestsRemaining: Math.max(MAX_VERIFICATION_REQUESTS_PER_HOUR - requestsInHour, 0)
	};
}

export async function verifyEmailCode(
	user: MinimalUser,
	submittedCode: string
): Promise<{ success: boolean; error?: string }> {
	if (!user.email) {
		return { success: false, error: 'No email is associated with this account.' };
	}

	const codeRecord = await prisma.verificationCode.findUnique({
		where: { userId: user.id }
	});

	if (!codeRecord) {
		return { success: false, error: 'No active verification code found. Request a new one.' };
	}

	const now = new Date();
	if (codeRecord.expiresAt.getTime() < now.getTime()) {
		await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
		await logEmailNotification({
			userId: user.id,
			email: user.email,
			notificationType: 'verification',
			referenceId: 'code_attempt',
			subject: 'Verification attempt: expired code',
			body: 'User submitted an expired verification code.',
			status: 'failed'
		});
		return { success: false, error: 'Code expired. Request a new one.' };
	}

	if (codeRecord.attempts >= MAX_VERIFICATION_ATTEMPTS_PER_CODE) {
		await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
		await ensureVerificationCode(user, { forceResend: true, ignoreRateLimits: true });
		await logEmailNotification({
			userId: user.id,
			email: user.email,
			notificationType: 'verification',
			referenceId: 'code_attempt',
			subject: 'Verification attempt: too many attempts',
			body: 'Too many incorrect verification attempts. A new code was sent.',
			status: 'failed'
		});
		return { success: false, error: 'Too many attempts. We sent a new code.' };
	}

	if (submittedCode !== codeRecord.code) {
		const updated = await prisma.verificationCode.update({
			where: { userId: user.id },
			data: {
				attempts: { increment: 1 },
				updatedAt: now
			},
			select: { attempts: true }
		});

		await logEmailNotification({
			userId: user.id,
			email: user.email,
			notificationType: 'verification',
			referenceId: 'code_attempt',
			subject: 'Verification attempt: invalid code',
			body: 'User submitted an invalid verification code.',
			status: 'failed'
		});

		if (updated.attempts >= MAX_VERIFICATION_ATTEMPTS_PER_CODE) {
			await prisma.verificationCode.deleteMany({ where: { userId: user.id } });
			await ensureVerificationCode(user, { forceResend: true, ignoreRateLimits: true });
			return { success: false, error: 'Too many attempts. We sent a new code.' };
		}

		return { success: false, error: 'Invalid code. Please try again.' };
	}

	await prisma.$transaction([
		prisma.user.update({
			where: { id: user.id },
			data: {
				emailVerified: true,
				emailVerifiedAt: now
			}
		}),
		prisma.verificationCode.deleteMany({
			where: { userId: user.id }
		})
	]);

	await logEmailNotification({
		userId: user.id,
		email: user.email,
		notificationType: 'verification',
		referenceId: 'code_attempt',
		subject: 'Verification successful',
		body: 'User successfully verified email with OTP.',
		status: 'sent'
	});

	await sendWelcomeEmailIfNeeded({
		userId: user.id,
		email: user.email,
		firstName: getFirstName(user.fullName || null, user.email)
	});

	return { success: true };
}

export {
	MAX_VERIFICATION_ATTEMPTS_PER_CODE,
	MAX_VERIFICATION_REQUESTS_PER_HOUR,
	RESEND_COOLDOWN_SECONDS,
	VERIFICATION_CODE_EXPIRY_MINUTES
};
