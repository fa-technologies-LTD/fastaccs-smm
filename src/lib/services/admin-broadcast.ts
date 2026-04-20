import { randomUUID } from 'crypto';
import { env } from '$env/dynamic/private';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { sendEmail } from './email';

export type BroadcastAudience =
	| 'all_verified'
	| 'purchased_30'
	| 'purchased_60'
	| 'purchased_90'
	| 'never_purchased'
	| 'specific_platform_buyers';

export interface BroadcastRecipient {
	id: string;
	email: string;
	fullName: string | null;
}

export interface BroadcastBatchConfig {
	batchSize: number;
	delayMs: number;
}

export interface BroadcastProgress {
	broadcastId: string;
	subject: string;
	body: string;
	audience: BroadcastAudience | null;
	audienceLabel: string;
	createdAt: string;
	total: number;
	sent: number;
	failed: number;
	pending: number;
	status: 'in_progress' | 'completed' | 'failed';
}

export interface BroadcastHistoryItem extends BroadcastProgress {}

export interface BroadcastDetails extends BroadcastProgress {
	recipients: Array<{
		id: string;
		email: string;
		name: string | null;
		status: string;
		sentAt: string | null;
		failedAt: string | null;
		errorMessage: string | null;
	}>;
	hasMoreRecipients: boolean;
}

const BROADCAST_TYPE = 'admin_broadcast';
const SUCCESSFUL_ORDER_FILTER: Prisma.OrderWhereInput = {
	OR: [{ paymentStatus: 'paid' }, { status: { in: ['paid', 'completed'] } }]
};

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
	all_verified: 'All verified users',
	purchased_30: 'Purchased in last 30 days',
	purchased_60: 'Purchased in last 60 days',
	purchased_90: 'Purchased in last 90 days',
	never_purchased: 'Never purchased',
	specific_platform_buyers: 'Specific platform buyers'
};

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(value, min), max);
}

export function getBroadcastBatchConfig(): BroadcastBatchConfig {
	const configuredBatchSize = Number(env.BROADCAST_BATCH_SIZE || 10);
	const configuredDelayMs = Number(env.BROADCAST_BATCH_DELAY_MS || 1000);

	return {
		batchSize: clamp(configuredBatchSize, 1, 200),
		delayMs: clamp(configuredDelayMs, 200, 30_000)
	};
}

export function parseBroadcastAudience(value: unknown): BroadcastAudience | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	if (!normalized) return null;

	if (
		normalized === 'all_verified' ||
		normalized === 'purchased_30' ||
		normalized === 'purchased_60' ||
		normalized === 'purchased_90' ||
		normalized === 'never_purchased' ||
		normalized === 'specific_platform_buyers'
	) {
		return normalized;
	}

	return null;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizePlatformIds(input: unknown): string[] {
	if (!Array.isArray(input)) return [];

	const ids = new Set<string>();
	for (const value of input) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!trimmed || !isUuid(trimmed)) continue;
		ids.add(trimmed);
	}

	return Array.from(ids);
}

function getAudienceReference(audience: BroadcastAudience, platformIds: string[]): string {
	const sortedIds = [...platformIds].sort();
	return `audience=${audience};platformIds=${sortedIds.join(',')}`;
}

function parseAudienceReference(referenceId: string | null): {
	audience: BroadcastAudience | null;
	audienceLabel: string;
} {
	if (!referenceId) {
		return {
			audience: null,
			audienceLabel: 'Unknown audience'
		};
	}

	const [audiencePart] = referenceId.split(';');
	const audienceRaw = audiencePart.replace(/^audience=/, '').trim();
	const audience = parseBroadcastAudience(audienceRaw);

	if (!audience) {
		return {
			audience: null,
			audienceLabel: 'Unknown audience'
		};
	}

	return {
		audience,
		audienceLabel: AUDIENCE_LABELS[audience]
	};
}

function getAudienceWhereClause(
	audience: BroadcastAudience,
	platformIds: string[]
): Prisma.UserWhereInput {
	const baseWhere: Prisma.UserWhereInput = {
		emailVerified: true,
		isActive: true,
		email: { not: null }
	};

	if (audience === 'all_verified') {
		return baseWhere;
	}

	if (audience === 'never_purchased') {
		return {
			...baseWhere,
			orders: {
				none: SUCCESSFUL_ORDER_FILTER
			}
		};
	}

	if (audience === 'specific_platform_buyers') {
		if (platformIds.length === 0) {
			return {
				...baseWhere,
				id: { in: [] }
			};
		}

		return {
			...baseWhere,
			orders: {
				some: {
					AND: [
						SUCCESSFUL_ORDER_FILTER,
						{
							orderItems: {
								some: {
									category: {
										parentId: { in: platformIds }
									}
								}
							}
						}
					]
				}
			}
		};
	}

	const days = audience === 'purchased_30' ? 30 : audience === 'purchased_60' ? 60 : 90;
	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

	return {
		...baseWhere,
		orders: {
			some: {
				AND: [SUCCESSFUL_ORDER_FILTER, { createdAt: { gte: since } }]
			}
		}
	};
}

export async function getBroadcastAudienceCount(
	audience: BroadcastAudience,
	platformIds: string[]
): Promise<number> {
	if (audience === 'specific_platform_buyers' && platformIds.length === 0) {
		return 0;
	}

	return prisma.user.count({
		where: getAudienceWhereClause(audience, platformIds)
	});
}

export async function getBroadcastRecipients(
	audience: BroadcastAudience,
	platformIds: string[]
): Promise<BroadcastRecipient[]> {
	if (audience === 'specific_platform_buyers' && platformIds.length === 0) {
		return [];
	}

	const users = await prisma.user.findMany({
		where: getAudienceWhereClause(audience, platformIds),
		select: {
			id: true,
			email: true,
			fullName: true
		},
		orderBy: { createdAt: 'desc' }
	});

	return users
		.filter((user): user is { id: string; email: string; fullName: string | null } => Boolean(user.email))
		.map((user) => ({
			id: user.id,
			email: user.email,
			fullName: user.fullName
		}));
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

export async function createBroadcast(
	params: {
		subject: string;
		body: string;
		audience: BroadcastAudience;
		platformIds: string[];
	}
): Promise<{ broadcastId: string; total: number }> {
	const recipients = await getBroadcastRecipients(params.audience, params.platformIds);
	if (recipients.length === 0) {
		return {
			broadcastId: randomUUID(),
			total: 0
		};
	}

	const broadcastId = randomUUID();
	const audienceReference = getAudienceReference(params.audience, params.platformIds);
	const subject = params.subject.trim();
	const body = params.body.trim();

	const batches = chunkArray(recipients, 500);
	for (const batch of batches) {
		await prisma.emailNotification.createMany({
			data: batch.map((recipient) => ({
				userId: recipient.id,
				email: recipient.email,
				notificationType: BROADCAST_TYPE,
				referenceId: audienceReference,
				subject,
				body,
				status: 'pending',
				broadcastId
			}))
		});
	}

	return {
		broadcastId,
		total: recipients.length
	};
}

async function computeBroadcastProgress(broadcastId: string): Promise<BroadcastProgress | null> {
	const [total, sent, failed, pending, firstRecord] = await Promise.all([
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'sent'
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'failed'
			}
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE,
				status: 'pending'
			}
		}),
		prisma.emailNotification.findFirst({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			},
			orderBy: { createdAt: 'asc' },
			select: {
				subject: true,
				body: true,
				referenceId: true,
				createdAt: true
			}
		})
	]);

	if (!firstRecord) return null;

	const audienceInfo = parseAudienceReference(firstRecord.referenceId || null);
	const status = pending > 0 ? 'in_progress' : sent === 0 && failed > 0 ? 'failed' : 'completed';

	return {
		broadcastId,
		subject: firstRecord.subject || '(No subject)',
		body: firstRecord.body || '',
		audience: audienceInfo.audience,
		audienceLabel: audienceInfo.audienceLabel,
		createdAt: firstRecord.createdAt.toISOString(),
		total,
		sent,
		failed,
		pending,
		status
	};
}

export async function processBroadcastBatch(
	broadcastId: string,
	batchSize: number
): Promise<{ processed: number; progress: BroadcastProgress | null }> {
	const pendingNotifications = await prisma.emailNotification.findMany({
		where: {
			broadcastId,
			notificationType: BROADCAST_TYPE,
			status: 'pending'
		},
		orderBy: { createdAt: 'asc' },
		take: clamp(batchSize, 1, 200)
	});

	if (pendingNotifications.length === 0) {
		return {
			processed: 0,
			progress: await computeBroadcastProgress(broadcastId)
		};
	}

	for (const notification of pendingNotifications) {
		const subject = (notification.subject || '').trim();
		const body = (notification.body || '').trim();
		if (!subject || !body) {
			await prisma.emailNotification.update({
				where: { id: notification.id },
				data: {
					status: 'failed',
					failedAt: new Date(),
					errorMessage: 'Missing subject or body for broadcast message.'
				}
			});
			continue;
		}

		await sendEmail({
			to: notification.email,
			subject,
			body,
			showCta: false,
			userId: notification.userId,
			notificationType: 'admin_broadcast',
			referenceId: notification.referenceId,
			broadcastId,
			notificationId: notification.id
		});
	}

	return {
		processed: pendingNotifications.length,
		progress: await computeBroadcastProgress(broadcastId)
	};
}

export async function getBroadcastProgress(broadcastId: string): Promise<BroadcastProgress | null> {
	return computeBroadcastProgress(broadcastId);
}

export async function getBroadcastHistory(limit = 20): Promise<BroadcastHistoryItem[]> {
	const rows = await prisma.emailNotification.findMany({
		where: {
			notificationType: BROADCAST_TYPE,
			broadcastId: { not: null }
		},
		select: {
			broadcastId: true,
			createdAt: true
		},
		orderBy: { createdAt: 'desc' },
		take: 2000
	});

	const seen = new Set<string>();
	const broadcastIds: string[] = [];
	for (const row of rows) {
		if (!row.broadcastId || seen.has(row.broadcastId)) continue;
		seen.add(row.broadcastId);
		broadcastIds.push(row.broadcastId);
		if (broadcastIds.length >= clamp(limit, 1, 100)) break;
	}

	const progressRows = await Promise.all(
		broadcastIds.map((broadcastId) => computeBroadcastProgress(broadcastId))
	);

	return progressRows
		.filter((row): row is BroadcastHistoryItem => Boolean(row))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBroadcastDetails(
	broadcastId: string,
	recipientLimit = 200
): Promise<BroadcastDetails | null> {
	const progress = await computeBroadcastProgress(broadcastId);
	if (!progress) return null;

	const limit = clamp(recipientLimit, 1, 1000);
	const [recipients, totalRecipients] = await Promise.all([
		prisma.emailNotification.findMany({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			},
			select: {
				id: true,
				email: true,
				status: true,
				sentAt: true,
				failedAt: true,
				errorMessage: true,
				user: {
					select: {
						fullName: true
					}
				}
			},
			orderBy: [{ status: 'asc' }, { email: 'asc' }],
			take: limit
		}),
		prisma.emailNotification.count({
			where: {
				broadcastId,
				notificationType: BROADCAST_TYPE
			}
		})
	]);

	return {
		...progress,
		recipients: recipients.map((recipient) => ({
			id: recipient.id,
			email: recipient.email,
			name: recipient.user?.fullName || null,
			status: recipient.status,
			sentAt: recipient.sentAt?.toISOString() || null,
			failedAt: recipient.failedAt?.toISOString() || null,
			errorMessage: recipient.errorMessage || null
		})),
		hasMoreRecipients: totalRecipients > recipients.length
	};
}

export function getAudienceLabel(audience: BroadcastAudience): string {
	return AUDIENCE_LABELS[audience];
}
