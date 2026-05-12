import { createHash } from 'crypto';
import { prisma } from '$lib/prisma';

export const LOGIN_RATE_LIMITS = {
	ip: { limit: 40, windowMs: 15 * 60 * 1000 },
	identity: { limit: 10, windowMs: 15 * 60 * 1000 }
} as const;

export const SIGNUP_RATE_LIMITS = {
	ip: { limit: 25, windowMs: 60 * 60 * 1000 },
	identity: { limit: 6, windowMs: 60 * 60 * 1000 }
} as const;

export const RESTOCK_NOTIFY_RATE_LIMITS = {
	ip: { limit: 18, windowMs: 60 * 60 * 1000 },
	email: { limit: 6, windowMs: 60 * 60 * 1000 }
} as const;

type RateLimitScope =
	| 'login_ip'
	| 'login_identity'
	| 'signup_ip'
	| 'signup_identity'
	| 'restock_notify_ip'
	| 'restock_notify_email';

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

const AUTH_NOTIFICATION_TYPE = 'auth_rate_limit';
const RESTOCK_NOTIFY_NOTIFICATION_TYPE = 'restock_notify_rate_limit';

function hashKey(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

function toReferenceId(prefix: string, scope: RateLimitScope, key: string): string {
	return `${prefix}:${scope}:${hashKey(key)}`;
}

export function getRequestClientIp(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for') || '';
	const xRealIp = request.headers.get('x-real-ip') || '';
	const candidate = forwardedFor.split(',')[0]?.trim() || xRealIp.trim();
	return candidate || 'unknown';
}

async function checkRateLimitWindow(params: {
	notificationType: string;
	referenceId: string;
	limit: number;
	windowMs: number;
}): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = new Date(now - params.windowMs);

	const [attemptCount, oldestAttempt] = await Promise.all([
		prisma.emailNotification.count({
			where: {
				notificationType: params.notificationType,
				referenceId: params.referenceId,
				createdAt: {
					gte: windowStart
				}
			}
		}),
		prisma.emailNotification.findFirst({
			where: {
				notificationType: params.notificationType,
				referenceId: params.referenceId,
				createdAt: {
					gte: windowStart
				}
			},
			orderBy: {
				createdAt: 'asc'
			},
			select: {
				createdAt: true
			}
		})
	]);

	if (attemptCount < params.limit) {
		return {
			allowed: true,
			remaining: Math.max(params.limit - attemptCount, 0),
			retryAfterSeconds: 0
		};
	}

	const oldestTs = oldestAttempt?.createdAt?.getTime() ?? now;
	const retryAfterMs = Math.max(oldestTs + params.windowMs - now, 1000);

	return {
		allowed: false,
		remaining: 0,
		retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
	};
}

export async function checkRateLimit(params: {
	scope: Exclude<RateLimitScope, 'restock_notify_ip' | 'restock_notify_email'>;
	key: string;
	limit: number;
	windowMs: number;
}): Promise<RateLimitResult> {
	return checkRateLimitWindow({
		notificationType: AUTH_NOTIFICATION_TYPE,
		referenceId: toReferenceId('auth_rl', params.scope, params.key),
		limit: params.limit,
		windowMs: params.windowMs
	});
}

export async function checkRestockNotifyRateLimit(params: {
	scope: 'restock_notify_ip' | 'restock_notify_email';
	key: string;
	limit: number;
	windowMs: number;
}): Promise<RateLimitResult> {
	return checkRateLimitWindow({
		notificationType: RESTOCK_NOTIFY_NOTIFICATION_TYPE,
		referenceId: toReferenceId('restock_notify_rl', params.scope, params.key),
		limit: params.limit,
		windowMs: params.windowMs
	});
}

async function recordRateLimitAttemptInternal(params: {
	notificationType: string;
	referenceId: string;
	scope: string;
	context?: string;
	email: string;
}): Promise<void> {
	await prisma.emailNotification.create({
		data: {
			userId: null,
			email: params.email,
			notificationType: params.notificationType,
			referenceId: params.referenceId,
			subject: params.scope,
			body: params.context ? params.context.slice(0, 400) : null,
			status: 'failed',
			failedAt: new Date()
		}
	});
}

export async function recordRateLimitAttempt(params: {
	scope: Exclude<RateLimitScope, 'restock_notify_ip' | 'restock_notify_email'>;
	key: string;
	context?: string;
}): Promise<void> {
	await recordRateLimitAttemptInternal({
		notificationType: AUTH_NOTIFICATION_TYPE,
		referenceId: toReferenceId('auth_rl', params.scope, params.key),
		scope: params.scope,
		context: params.context,
		email: 'auth-rate-limit@fastaccs.local'
	});
}

export async function recordRestockNotifyRateLimitAttempt(params: {
	scope: 'restock_notify_ip' | 'restock_notify_email';
	key: string;
	context?: string;
}): Promise<void> {
	await recordRateLimitAttemptInternal({
		notificationType: RESTOCK_NOTIFY_NOTIFICATION_TYPE,
		referenceId: toReferenceId('restock_notify_rl', params.scope, params.key),
		scope: params.scope,
		context: params.context,
		email: 'restock-notify-rate-limit@fastaccs.local'
	});
}
