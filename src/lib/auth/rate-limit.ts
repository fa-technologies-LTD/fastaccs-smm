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

type RateLimitScope = 'login_ip' | 'login_identity' | 'signup_ip' | 'signup_identity';

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

const NOTIFICATION_TYPE = 'auth_rate_limit';

function hashKey(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

function toReferenceId(scope: RateLimitScope, key: string): string {
	return `auth_rl:${scope}:${hashKey(key)}`;
}

export function getRequestClientIp(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for') || '';
	const xRealIp = request.headers.get('x-real-ip') || '';
	const candidate = forwardedFor.split(',')[0]?.trim() || xRealIp.trim();
	return candidate || 'unknown';
}

export async function checkRateLimit(params: {
	scope: RateLimitScope;
	key: string;
	limit: number;
	windowMs: number;
}): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = new Date(now - params.windowMs);
	const referenceId = toReferenceId(params.scope, params.key);

	const [attemptCount, oldestAttempt] = await Promise.all([
		prisma.emailNotification.count({
			where: {
				notificationType: NOTIFICATION_TYPE,
				referenceId,
				createdAt: {
					gte: windowStart
				}
			}
		}),
		prisma.emailNotification.findFirst({
			where: {
				notificationType: NOTIFICATION_TYPE,
				referenceId,
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

export async function recordRateLimitAttempt(params: {
	scope: RateLimitScope;
	key: string;
	context?: string;
}): Promise<void> {
	await prisma.emailNotification.create({
		data: {
			userId: null,
			email: 'auth-rate-limit@fastaccs.local',
			notificationType: NOTIFICATION_TYPE,
			referenceId: toReferenceId(params.scope, params.key),
			subject: params.scope,
			body: params.context ? params.context.slice(0, 400) : null,
			status: 'failed',
			failedAt: new Date()
		}
	});
}
