import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { Prisma } from '@prisma/client';
import {
	RESTOCK_NOTIFY_RATE_LIMITS,
	checkRestockNotifyRateLimit,
	getRequestClientIp,
	recordRestockNotifyRateLimitAttempt
} from '$lib/auth/rate-limit';

interface NotifyBody {
	email?: unknown;
	platformSlug?: unknown;
	topic?: unknown;
}

interface NotifySubscriber {
	email: string;
	requestedAt: string;
	source?: string;
}

interface JsonSubscriber {
	email: string;
	requestedAt: string;
	source?: string;
}

function normalizeEmail(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSubscriberList(input: unknown): NotifySubscriber[] {
	if (!Array.isArray(input)) return [];
	return input
		.map((entry) => {
			if (!entry || typeof entry !== 'object') return null;
			const record = entry as Record<string, unknown>;
			const email = normalizeEmail(record.email);
			if (!email) return null;
			return {
				email,
				requestedAt:
					typeof record.requestedAt === 'string' && record.requestedAt.trim()
						? record.requestedAt
						: new Date().toISOString(),
				source: typeof record.source === 'string' ? record.source : undefined
			} as NotifySubscriber;
		})
		.filter((entry): entry is NotifySubscriber => Boolean(entry));
}

function upsertSubscriber(
	existing: NotifySubscriber[],
	email: string,
	source?: string
): { list: NotifySubscriber[]; alreadyExists: boolean } {
	const now = new Date().toISOString();
	const index = existing.findIndex((entry) => entry.email === email);

	if (index >= 0) {
		const updated = [...existing];
		updated[index] = {
			...updated[index],
			requestedAt: now,
			source: source || updated[index].source
		};
		return { list: updated, alreadyExists: true };
	}

	return {
		list: [...existing, { email, requestedAt: now, source }],
		alreadyExists: false
	};
}

function toJsonSubscribers(list: NotifySubscriber[]): JsonSubscriber[] {
	return list.map((entry) => ({
		email: entry.email,
		requestedAt: entry.requestedAt,
		...(entry.source ? { source: entry.source } : {})
	}));
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = (await request.json()) as NotifyBody;
		const topic = typeof body.topic === 'string' ? body.topic.trim().toLowerCase() : 'platform';
		const platformSlug =
			typeof body.platformSlug === 'string' ? body.platformSlug.trim().toLowerCase() : '';
		const email = normalizeEmail(body.email) || normalizeEmail(locals.user?.email);
		const clientIp = getRequestClientIp(request);
		const ipKey = `ip:${clientIp}`;

		const ipLimit = await checkRestockNotifyRateLimit({
			scope: 'restock_notify_ip',
			key: ipKey,
			limit: RESTOCK_NOTIFY_RATE_LIMITS.ip.limit,
			windowMs: RESTOCK_NOTIFY_RATE_LIMITS.ip.windowMs
		});
		if (!ipLimit.allowed) {
			return json(
				{
					success: false,
					error: `Too many notify requests. Try again in ${ipLimit.retryAfterSeconds}s.`
				},
				{ status: 429, headers: { 'retry-after': String(ipLimit.retryAfterSeconds) } }
			);
		}

		if (!isValidEmail(email)) {
			await recordRestockNotifyRateLimitAttempt({
				scope: 'restock_notify_ip',
				key: ipKey,
				context: 'invalid_email'
			});
			return json(
				{ success: false, error: 'Please provide a valid email address.' },
				{ status: 400 }
			);
		}

		const emailKey = `email:${email}`;
		const emailLimit = await checkRestockNotifyRateLimit({
			scope: 'restock_notify_email',
			key: emailKey,
			limit: RESTOCK_NOTIFY_RATE_LIMITS.email.limit,
			windowMs: RESTOCK_NOTIFY_RATE_LIMITS.email.windowMs
		});
		if (!emailLimit.allowed) {
			await recordRestockNotifyRateLimitAttempt({
				scope: 'restock_notify_ip',
				key: ipKey,
				context: 'email_limit_block'
			});
			return json(
				{
					success: false,
					error: `Too many notify requests for this email. Try again in ${emailLimit.retryAfterSeconds}s.`
				},
				{ status: 429, headers: { 'retry-after': String(emailLimit.retryAfterSeconds) } }
			);
		}

		await Promise.all([
			recordRestockNotifyRateLimitAttempt({
				scope: 'restock_notify_ip',
				key: ipKey,
				context: `${topic || 'platform'}:${platformSlug || 'global'}`
			}),
			recordRestockNotifyRateLimitAttempt({
				scope: 'restock_notify_email',
				key: emailKey,
				context: `${topic || 'platform'}:${platformSlug || 'global'}`
			})
		]);

		if (topic === 'growth_services') {
			const key = 'growth_services.notify_subscribers';
			const existingRecord = await prisma.microcopy.findUnique({ where: { key } });
			let existingSubscribers: NotifySubscriber[] = [];
			if (existingRecord) {
				try {
					existingSubscribers = normalizeSubscriberList(JSON.parse(existingRecord.value || '[]'));
				} catch {
					existingSubscribers = [];
				}
			}

			const { list, alreadyExists } = upsertSubscriber(existingSubscribers, email, topic);

			await prisma.microcopy.upsert({
				where: { key },
				update: {
					value: JSON.stringify(list)
				},
				create: {
					key,
					value: JSON.stringify(list),
					category: 'notifications',
					description: 'Boosting Services launch notification subscribers'
				}
			});

			return json({
				success: true,
				alreadyExists,
				message: alreadyExists
					? 'You are already on the Boosting Services notify list.'
					: 'You have been added to the Boosting Services notify list.'
			});
		}

		if (!platformSlug) {
			return json(
				{ success: false, error: 'Platform slug is required for this notification.' },
				{ status: 400 }
			);
		}

		const platform = await prisma.category.findFirst({
			where: {
				slug: platformSlug,
				categoryType: 'platform'
			},
			select: {
				id: true,
				name: true,
				metadata: true
			}
		});

		if (!platform) {
			return json({ success: false, error: 'Platform not found.' }, { status: 404 });
		}

		const metadataValue =
			platform.metadata &&
			typeof platform.metadata === 'object' &&
			!Array.isArray(platform.metadata)
				? (platform.metadata as Record<string, unknown>)
				: {};

		const existingSubscribers = normalizeSubscriberList(metadataValue.restockSubscribers);
		const { list, alreadyExists } = upsertSubscriber(existingSubscribers, email, platformSlug);
		const restockSubscribersJson = toJsonSubscribers(list);

		const nextMetadata: Prisma.InputJsonObject = {
			...(metadataValue as Prisma.InputJsonObject),
			restockSubscribers: restockSubscribersJson as unknown as Prisma.InputJsonValue
		};

		await prisma.category.update({
			where: { id: platform.id },
			data: {
				metadata: nextMetadata
			}
		});

		return json({
			success: true,
			alreadyExists,
			message: alreadyExists
				? `You are already subscribed for ${platform.name} restock alerts.`
				: `You will be notified when ${platform.name} is back in stock.`
		});
	} catch (error) {
		console.error('Failed to subscribe to notify list:', error);
		return json(
			{ success: false, error: 'Failed to subscribe right now. Please try again.' },
			{ status: 500 }
		);
	}
};
